import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import db from '@/lib/db'; // DB接続 (db.queryが直接使えることを想定)

/**
 * 7. 【検査後】結果と画像の送信 (UPDATE)
 * ★ captured_at の上書きを *しない* バージョン
 */
export async function PUT(request, { params }) {
  const filename = params.filename;
  if (!filename) {
    return NextResponse.json({ "error": "Bad Request", "details": "URLにファイル名が必要です。" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    
    const metadataString = formData.get('metadata');
    const imageFile = formData.get('image'); 

    if (!metadataString) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataが必須です。" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataString);
    // ★ captured_at のバリデーションを削除
    const { status, details } = metadata;

    if (!status) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataに 'status' が必須です。" }, { status: 400 });
    }

    // --- トランザクション開始 ---
    await db.query('BEGIN');

    // 4. 更新対象のレコードをDBから探す (変更なし)
    const findQuery = `
      SELECT id FROM inspection_camera_shots
      WHERE image_path LIKE $1
      LIMIT 1;
    `;
    const findResult = await db.query(findQuery, [`%/${filename}`]);

    if (findResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return NextResponse.json(
        { "error": "Not Found", "details": "指定されたファイルの検査前データが見つかりません。" },
        { status: 404 }
      );
    }
    
    const shotDbId = findResult.rows[0].id;
    let publicImagePath = null;

    // 5. 画像ファイルの保存 (変更なし)
    if (imageFile) {
      const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'afterTest');
      await fs.mkdir(uploadDir, { recursive: true });

      const savePath = path.join(uploadDir, filename);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      await fs.writeFile(savePath, buffer);
      
      publicImagePath = `/ImageDB/afterTest/${filename}`;
    }

    // --- 6. データベースをUPDATE (★ここを修正) ---
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET
        status = $1,
        details = $2
        ${imageFile ? ', image_path = $3' : ''} 
      WHERE
        id = ${imageFile ? '$4' : '$3'};
    `;
    
    // ★ queryParams から captured_at を削除
    const queryParams = imageFile
      ? [status, details, publicImagePath, shotDbId]
      : [status, details, shotDbId];

    await db.query(updateQuery, queryParams);

    // --- トランザクションをコミット ---
    await db.query('COMMIT');

    // 7. 成功レスポンス (変更なし)
    return NextResponse.json(
      {
        "message": "検査結果、受信したよ！",
        "filename": publicImagePath || `(画像は更新されませんでした)`
      },
      { status: 200 }
    );

  } catch (error) {
    await db.query('ROLLBACK');
    console.error(`[API ERROR] /api/ingress/inspection/result/${filename}:`, error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}