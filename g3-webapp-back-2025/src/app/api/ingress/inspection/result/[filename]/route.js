import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import db from '@/lib/db'; // DB接続

/**
 * 7. 【検査後】API (★画像パスをファイル名のみ保存ver)
 * (captured_at の上書きは *しない* バージョン)
 */
export async function PUT(request, { params }) {
  const filename = params.filename; // (例: MAT-00001_B-spring01_1.jpg)
  if (!filename) {
    return NextResponse.json({ "error": "Bad Request", "details": "URLにファイル名が必要です。" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const metadataString = formData.get('metadata');
    const imageFile = formData.get('image'); 

    // (バリデーションは変更なし)
    if (!metadataString) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataが必須です。" }, { status: 400 });
    }
    const metadata = JSON.parse(metadataString);
    const { status, details } = metadata;
    if (!status) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataに 'status' が必須です。" }, { status: 400 });
    }

    await db.query('BEGIN');

    // --- 4. 更新対象のレコードをDBから探す (★修正) ---
    // image_path カラムにファイル名がそのまま保存されている前提
    const findQuery = `
      SELECT id FROM inspection_camera_shots
      WHERE image_path = $1 
      LIMIT 1;
    `;
    // ★ LIKE '%/filename' から、完全一致 'filename' に変更
    const findResult = await db.query(findQuery, [filename]); 

    if (findResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return NextResponse.json(
        { "error": "Not Found", "details": "指定されたファイルの検査前データが見つかりません。" },
        { status: 404 }
      );
    }
    
    const shotDbId = findResult.rows[0].id;
    let newImagePath = null; // ★ 変数名を変更

    // --- 5. 検査後の画像ファイルが送信されていれば保存 (★修正) ---
    if (imageFile) {
      // 物理的な保存先フォルダは変更なし
      const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'afterTest');
      await fs.mkdir(uploadDir, { recursive: true });

      // ファイル名はURLパラメータのものをそのまま使用 (変更なし)
      const savePath = path.join(uploadDir, filename);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      await fs.writeFile(savePath, buffer);
      
      // ★ DBに保存する値は、ファイル名のみ
      newImagePath = filename; 
    }

    // --- 6. データベースをUPDATE (★修正) ---
    // (captured_at を更新しないロジックのまま)
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET
        status = $1,
        details = $2
        ${imageFile ? ', image_path = $3' : ''} 
      WHERE
        id = ${imageFile ? '$4' : '$3'};
    `;
    
    const queryParams = imageFile
      ? [status, details, newImagePath, shotDbId] // ★ newImagePath (ファイル名のみ) を使用
      : [status, details, shotDbId];

    await db.query(updateQuery, queryParams);
    await db.query('COMMIT');

    // --- 7. 成功レスポンス (★修正) ---
    return NextResponse.json(
      {
        "message": "検査結果、受信したよ！",
        // ★ 画像が更新されなくても、元のファイル名を返すように修正
        "filename": filename 
      },
      { status: 200 }
    );

  } catch (error) {
    await db.query('ROLLBACK');
    console.error(`[API ERROR] /api/ingress/inspection/result/${filename}:`, error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}