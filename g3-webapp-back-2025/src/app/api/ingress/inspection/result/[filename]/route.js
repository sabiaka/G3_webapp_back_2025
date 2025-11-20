import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール
import { writeFile, mkdir } from 'fs/promises'; // 画像保存用 (Node.js v14+)
import path from 'path'; // パス結合用

// 設計書（セクション7）に基づく「検査後」画像の保存ディレクトリ
const IMAGE_DIR_AFTER = '/imageDB/afterTest/';
// サーバーのファイルシステム上の絶対パス (Next.jsの public ディレクトリを想定)
const SAVE_DIR_AFTER = path.join(process.cwd(), 'public', IMAGE_DIR_AFTER);

/**
 * API: 7. 【検査後】結果と画像の送信（filename指定・単発）
 * (PUT /api/ingress/inspection/result/{filename})
 */
export async function PUT(request, context) {
  const client = await pool.connect(); // トランザクションのために接続を専有
  
  try {
    // 1. パスパラメータ（{filename}）を取得
    // (例: "LOLL-10031_A-main01_A-1_B-1.png")
    const { filename } = await context.params; 

    // 2. multipart/form-data をパース
    const formData = await request.formData();
    const metadataJson = formData.get('metadata');
    const imageFile = formData.get('image'); // 検査後画像 (任意)

    // 3. バリデーション (metadata は必須)
    if (!metadataJson) {
      return NextResponse.json(
        { error: "Bad Request", details: "リクエストに 'metadata' (JSON) が必要です。" },
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

    // 5. metadata の内容を検証 (status は必須)
    const { status, details, captured_at } = metadata;
    if (!status || (status !== 'PASS' && status !== 'FAIL')) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata に 'status' ('PASS' または 'FAIL') が必要です。" },
        { status: 400 }
      );
    }

    await client.query('BEGIN'); // --- トランザクション開始 ---

    // 6. (DB処理 1) filename から、更新対象のショットID (id) を見つける
    // (API 6 で登録された '.../beforeTest/...' のパスを検索)
    const findQuery = `
      SELECT id 
      FROM inspection_camera_shots 
      WHERE image_path LIKE $1;
    `;
    // (例: '%/LOLL-10031_A-main01_A-1_B-1.png')
    const findParams = [`%/${filename}`]; 
    
    const findResult = await client.query(findQuery, findParams);

    if (findResult.rows.length === 0) {
      // 該当する検査前データが見つからない
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: "Not Found", details: "指定された filename に一致する検査前データが見つかりません。" },
        { status: 404 }
      );
    }
    const shotId = findResult.rows[0].id; // 更新対象の主キー

    // 7. (任意) 検査後画像ファイルが送信されていれば保存
    if (imageFile) {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      const savePath = path.join(SAVE_DIR_AFTER, filename);
      
      // (ディレクトリが存在しない場合に備えて作成)
      await mkdir(SAVE_DIR_AFTER, { recursive: true });
      
      await writeFile(savePath, imageBuffer);
      // (注意: DBの image_path は 'beforeTest' のまま変更しないのが設計書(セクション8)の仕様)
    }

    // 8. (DB処理 2) 検査結果で inspection_camera_shots を UPDATE
    // (status は必須、details と captured_at は任意)
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET 
        status = $1, 
        details = $2,
        -- captured_at がJSONになければ、DBの既存の値をそのまま使う
        captured_at = COALESCE($3, captured_at) 
      WHERE 
        id = $4;
    `;
    await client.query(updateQuery, [
      status,       // $1
      details || null, // $2
      captured_at || null, // $3
      shotId        // $4
    ]);

    await client.query('COMMIT'); // --- トランザクション確定 ---

    // 9. 成功レスポンス (200 OK)
    return NextResponse.json(
      {
        message: "検査結果、更新しときました！🎉",
        filename: filename
      },
      { status: 200 }
    );

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK'); // --- エラー時ロールバック ---
    }
    console.error('API Error (PUT ingress/inspection/result/{filename}):', error);
    
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