import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import db from '@/lib/db'; // DB接続

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
 */
export async function POST(request) {
  try {
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
    // ★ ロットの代表時刻として、1番目のショットの時刻を使用
    const lotCapturedAt = shots[0]?.captured_at || new Date().toISOString();
    
    const insertLotQuery = `
      INSERT INTO inspection_lots (lot_id, section_code, captured_at)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const lotResult = await db.query(insertLotQuery, [newLotId, section_code, lotCapturedAt]);
    const lotDbId = lotResult.rows[0].id; // 共通のロットID

    // --- 5. 物理フォルダの準備 ---
    const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'beforeTest');
    await fs.mkdir(uploadDir, { recursive: true });

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
        // 6-1. ファイル名生成
        const extension = path.extname(imageFile.name) || '.jpg';
        const newFilename = `${newLotId}_${camera_id}_${shot_seq}${extension}`;
        
        // ★ DBにはファイル名のみ保存
        publicImagePath = newFilename; 

        // 6-2. 物理ファイル保存
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        await fs.writeFile(path.join(uploadDir, newFilename), buffer);
        
        createdFilenames.push(newFilename);
      } else {
        console.warn(`[API 6] camera_id: ${camera_id} の画像ファイルが見つかりません。`);
      }

      // 6-3. inspection_camera_shots (ショット) をDBに登録
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

    await db.query('COMMIT');

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
    await db.query('ROLLBACK');
    console.error('[API ERROR] /api/ingress/inspection:', error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}