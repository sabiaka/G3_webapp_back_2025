/**
 * ファイルの役割:
 *   【検査前 初期登録(複数ショット一括)】のエンドポイントを提供するAPIルート。
 *   multipart/form-dataからmetadataと複数画像を受け取り、ロットID採番→ロット登録→ショット登録→画像保存を行う。
 *
 * 実装ポリシー:
 *   - 入力は必須項目を厳密に検証する(日本語メッセージで400返却)。
 *   - DB操作とファイル保存の整合性を保つため、トランザクションを使用。
 *   - ファイル名のみをDBに保持し、実ファイルは所定のストレージパスへ保存。
 */
import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import db from '@/lib/db'; // DB接続
import { buildBeforeImageUrl, prepareImageTarget } from '@/lib/image-storage';
import { emitEvent } from '@/lib/event-bus';

// (generateNewLotId 関数は変更なし)
async function generateNewLotId(prefix) {
  const query = `
    SELECT lot_id FROM inspection_lots
    WHERE lot_id LIKE $1
    ORDER BY lot_id DESC
    LIMIT 1;
  `;
  const result = await db.query(query, [`${prefix}%`]);
  let nextNumber = 1;
  if (result.rows.length > 0) {
    const lastId = result.rows[0].lot_id;
    const lastNumber = parseInt(lastId.replace(prefix, ''), 10);
    nextNumber = lastNumber + 1;
  }
  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

/**
 * 6. 【初期登録】API (★複数ショット一括登録バージョン)
 * (画像パスはファイル名のみ保存)
 *
 * 説明:
 *   section_codeに応じてロットIDを採番し、`shots` 配列の各要素について検査前画像とショット情報を登録する。
 *   画像はストレージに保存し、DBにはファイル名のみ保存する。
 *
 * I/O:
 *   @param {Request} request                                   - multipart/form-data を受け取るリクエスト
 *   @returns {NextResponse}                                     - JSON: { message, lot_id, filenames }
 *
 * リクエスト(form-data):
 *   metadata                                                    - JSON文字列。{ section_code: 'spring'|'alayer', shots: Array<{camera_id, shot_seq?, captured_at?}> }
 *   各camera_id                                                 - 各ショットに対応する画像ファイル(Binary)。キーはcamera_idと一致。
 *
 * ステータス:
 *   201                                                         - 作成成功
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー(ロールバック)
 */
export async function POST(request) {
  try {
    // ======== form-data取得: metadata(必須)と画像バイナリ群を得る ========
    const formData = await request.formData();
    const metadataString = formData.get('metadata');

    // --- バリデーション ---
    if (!metadataString) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataが必須です。" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataString);
    // ★ shots 配列を受け取るように変更
    const { section_code, shots } = metadata; 

    if (!section_code || !shots || !Array.isArray(shots) || shots.length === 0) {
      return NextResponse.json(
        { "error": "Bad Request", "details": "metadataに必要な 'section_code' と 'shots' (配列) が不足しています。" },
        { status: 400 }
      );
    }

    // ======== トランザクション開始: DB整合性の担保 ========
    await db.query('BEGIN');

    // --- 3. lot_id の採番 (変更なし) ---
    let lotIdPrefix;
    if (section_code === 'spring') {
      lotIdPrefix = 'MAT-';
    } else if (section_code === 'alayer') {
      lotIdPrefix = 'LOLL-';
    } else {
      throw new Error(`不明なsection_codeです: ${section_code}`);
    }
    const newLotId = await generateNewLotId(lotIdPrefix);

    // --- 4. inspection_lots (ロット) をDBに登録 ---
    // なぜ: ロットIDを親としてショットをぶら下げる構造のため、先に親を確定する
    // ★ ロットの代表時刻として、1番目のショットの時刻を使用
    const lotCapturedAt = shots[0]?.captured_at || new Date().toISOString();
    
    const insertLotQuery = `
      INSERT INTO inspection_lots (lot_id, section_code, captured_at)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const lotResult = await db.query(insertLotQuery, [newLotId, section_code, lotCapturedAt]);
    const lotDbId = lotResult.rows[0].id; // 共通のロットID

    const createdFilenames = []; // 成功レスポンス用にファイル名を格納

    // --- 6. shots 配列をループして画像とDB登録 ---
    const insertShotQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, camera_id, status, details, shot_seq, captured_at, image_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

    for (const shot of shots) {
      const { camera_id, shot_seq = 1, captured_at: shot_captured_at } = shot;
      let publicImagePath = null; // DBに保存するファイル名

      // ★ metadataの camera_id をキーにして画像ファイルを取得
      const imageFile = formData.get(camera_id);

      if (imageFile) {
        // ======== ファイル名生成と保存: パス解決→書き込み ========
        // 6-1. ファイル名生成
        const extension = path.extname(imageFile.name) || '.jpg';
        const newFilename = `${newLotId}_${camera_id}_${shot_seq}${extension}`;
        
        // ★ DBにはファイル名のみ保存
        publicImagePath = newFilename; 

        // 6-2. 物理ファイル保存
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        const imageUrl = buildBeforeImageUrl(newFilename);
        const targetPath = await prepareImageTarget(imageUrl);
        await writeFile(targetPath, buffer);
        
        createdFilenames.push(newFilename);
      } else {
        console.warn(`[API 6] camera_id: ${camera_id} の画像ファイルが見つかりません。`);
      }

      // 6-3. inspection_camera_shots (ショット) をDBに登録
      // なぜ: 初期状態を 'MISSING' とし、後工程で結果/後画像が登録される前提
      await db.query(insertShotQuery, [
        lotDbId, // ★ 共通のロットID
        camera_id,
        'MISSING', // 初期登録は'MISSING'
        null,
        shot_seq,
        shot_captured_at,
        publicImagePath // ファイル名 (画像がなければ null)
      ]);
    }

    // ======== コミット: ここまでのDB操作を確定 ========
    await db.query('COMMIT');

    emitEvent({
      type: 'inspection:lotCreated',
      lotId: newLotId,
      sectionCode: section_code,
      filenames: createdFilenames,
    });

    // --- 7. 成功レスポンス ---
    return NextResponse.json(
      {
        "message": "初期データ一括登録OK！ロットIDを採番したよ。",
        "lot_id": newLotId,
        "filenames": createdFilenames // 作成したファイル名のリスト
      },
      { status: 201 }
    );

  } catch (error) {
    await db.query('ROLLBACK'); // エラー時は整合性のために必ずロールバック
    console.error('[API ERROR] /api/ingress/inspection:', error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}