import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール
import { writeFile, mkdir } from 'fs/promises'; // 画像保存用 (Node.js v14+)
import path from 'path'; // パス結合用

// 設計書（セクション6）に基づく画像保存ディレクトリ
const IMAGE_DIR = '/imageDB/beforeTest/'; 
// サーバーのファイルシステム上の絶対パス (Next.jsの public ディレクトリを想定)
const SAVE_DIR = path.join(process.cwd(), 'public', IMAGE_DIR);

/**
 * API: 6. 【検査前】画像アップロード（lot_id指定・単発）(A層検査用)
 * (POST /api/ingress/inspection/{lot_id})
 */
export async function POST(request, { params }) {
  let client; // DBクライアント

  try {
    // 1. パスパラメータ（{lot_id}）を取得
    const lotId = params.lot_id; // (例: "MAT-00125")

    // 2. multipart/form-data をパース
    const formData = await request.formData();
    const metadataJson = formData.get('metadata');
    const imageFile = formData.get('image');

    // 3. バリデーション
    if (!metadataJson || !imageFile) {
      return NextResponse.json(
        { error: "Bad Request", details: "リクエストに 'metadata' (JSON) と 'image' (ファイル) の両方が必要です。" },
        { status: 400 }
      );
    }

    // 4. metadata (JSON) をパース
    let metadata;
    try {
      metadata = JSON.parse(metadataJson);
    } catch (e) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata が有効な JSON ではありません。" },
        { status: 400 }
      );
    }

    // 5. metadata の内容を検証 (API 6 の仕様)
    //    設計書の '4K_seq' キーを 'c4k_seq' (DBカラム名) にマッピング
    const { camera_id, '4K_seq': c4k_seq, 'FHD_seq': fhd_seq, captured_at, section_code } = metadata;
    
    if (!camera_id || !c4k_seq || !fhd_seq || !section_code) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata に 'camera_id', '4K_seq', 'FHD_seq', 'section_code' が必要です。" },
        { status: 400 }
      );
    }

    // 6. DBに接続
    client = await pool.connect();

    // 7. (DB処理 1) パスの lot_id から inspection_lots の主キー (id) を取得
    //    (lot_id と section_code の両方が一致するものを探す)
    const lotResult = await client.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1 AND section_code = $2',
      [lotId, section_code]
    );

    if (lotResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Not Found", details: `指定された lot_id (${lotId}) または section_code (${section_code}) が inspection_lots に見つかりません。` },
        { status: 404 }
      );
    }
    const lotIdRef = lotResult.rows[0].id; // これが inspection_camera_shots に使う lot_id_ref

    // 8. ファイル名を生成 (設計書セクション6のルール)
    // (例: MAT-00125_B-spring01_A-4_D-5.png)
    const filename = `${lotId}_${camera_id}_${c4k_seq}_${fhd_seq}.png`;
    
    // 9. 画像ファイルをサーバーに保存
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const savePath = path.join(SAVE_DIR, filename);
    
    // (ディレクトリが存在しない場合に備えて作成)
    await mkdir(SAVE_DIR, { recursive: true });
    
    await writeFile(savePath, imageBuffer);

    // 10. (DB処理 2) inspection_camera_shots にデータを INSERT
    // (注意: 検査前データは status: 'MISSING' (未検査) として登録)
    const imageDbPath = path.join(IMAGE_DIR, filename).replace(/\\/g, '/'); // DBには /imageDB/... のパスを保存
    const insertQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, 
        camera_id, 
        c4k_seq,      -- c4k_seq カラム
        fhd_seq,      -- fhd_seq カラム
        status,       -- 'MISSING' (未検査)
        image_path,   -- 保存した画像のパス
        captured_at   -- メタデータから取得した撮影時刻
      )
      VALUES ($1, $2, $3, $4, 'MISSING', $5, $6);
    `;
    await client.query(insertQuery, [
      lotIdRef,
      camera_id,
      c4k_seq,
      fhd_seq,
      imageDbPath,
      captured_at || new Date() // captured_at がなければ現在時刻
    ]);

    // 11. 成功レスポンス (201 Created)
    return NextResponse.json(
      {
        message: "検査前画像を登録しました",
        lot_id: lotId,
        filename: filename
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('API Error (POST ingress/inspection/{lot_id}):', error);
    
    // DBエラーなど
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release(); // 接続をプールに返却
    }
  }
}