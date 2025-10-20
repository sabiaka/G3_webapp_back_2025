import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続設定をインポート
import { promises as fs } from 'fs';
import path from 'path';

/* 画像と検査データを受信するAPI (POST) */
export async function POST(request) {
  try {
    // 1. multipart/form-dataを解析
    const formData = await request.formData();
    const metadataString = formData.get('metadata');
    const imageFile = formData.get('image_file');

    // --- バリデーション ---
    if (!metadataString || !imageFile) {
      return NextResponse.json(
        { message: 'metadataとimage_fileの両方が必須です。' },
        { status: 400 }
      );
    }

    let metadata;
    try {
      metadata = JSON.parse(metadataString);
    } catch (e) {
      return NextResponse.json(
        { message: 'metadataが有効なJSON形式ではありません。' },
        { status: 400 }
      );
    }

    // 2. ディレクトリ設定
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'inspections');
    await fs.mkdir(uploadDir, { recursive: true });

    // --- ここからファイル名生成ロジック ---
    const {
      product_id,
      camera_id,
      result,
      reason,
      captured_at,
      inspected_at
    } = metadata;
    
    // 現在時刻からタイムスタンプを生成
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
    
    // 元のファイルから拡張子を取得
    const extension = path.extname(imageFile.name);

    // 新しいファイル名を組み立て
    const newFilename = `${product_id}${extension}`;
    
    const imagePath = path.join(uploadDir, newFilename);
    const publicImagePath = `/uploads/inspections/${newFilename}`;

    // ファイルを書き込み
    await fs.writeFile(imagePath, Buffer.from(await imageFile.arrayBuffer()));
    // --- ファイル名生成ここまで ---

    // 3. データベース処理
    // product_idで既存レコードを検索
    const existingInspection = await db.query(
      'SELECT * FROM inspection_results WHERE inspection_product_id = $1',
      [product_id]
    );

    if (existingInspection.rows.length > 0) {
      // --- 存在する場合：UPDATE ---
      console.log(`[DB] 既存データ更新: ${product_id}`);
      const updateQuery = `
        UPDATE inspection_results
        SET
          inspection_camera_id = $1,
          inspection_result = $2,
          inspection_reason = $3,
          inspection_captured_time = $4,
          inspection_inspected_time = $5,
          inspection_image_path = $6
        WHERE inspection_product_id = $7;
      `;
      await db.query(updateQuery, [
        camera_id,
        result,
        reason,
        captured_at,
        inspected_at,
        publicImagePath, // ★新しいファイルパス
        product_id
      ]);

    } else {
      // --- 存在しない場合：INSERT ---
      console.log(`[DB] 新規データ作成: ${product_id}`);
      const insertQuery = `
        INSERT INTO inspection_results (
          inspection_product_id,
          inspection_camera_id,
          inspection_result,
          inspection_reason,
          inspection_captured_time,
          inspection_inspected_time,
          inspection_image_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `;
      await db.query(insertQuery, [
        product_id,
        camera_id,
        result,
        reason,
        captured_at,
        inspected_at,
        publicImagePath // ★新しいファイルパス
      ]);
    }

    // 4. 仕様通りの成功レスポンスを返す
    return NextResponse.json(
      { message: 'データを受付け、処理を開始します。' },
      { status: 202 }
    );

  } catch (error) {
    console.error('DBまたはファイル処理でエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}