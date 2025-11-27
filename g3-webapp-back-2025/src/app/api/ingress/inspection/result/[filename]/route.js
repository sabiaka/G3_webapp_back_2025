import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// 設計書に基づく「検査後」画像の保存ディレクトリ
const IMAGE_DIR_AFTER = '/imageDB/afterTest/';
const SAVE_DIR_AFTER = path.join(process.cwd(), 'public', IMAGE_DIR_AFTER);

// ★復元: 指定ミリ秒待機するヘルパー関数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * API: 7. 【検査後】結果と画像の送信（filename指定・単発）
 * (PUT /api/ingress/inspection/result/{filename})
 */
export async function PUT(request, context) {
  // リトライ中は接続を占有しないため、まだ connect しない
  
  try {
    // 1. パスパラメータ取得 (Next.js 15対応)
    const { filename } = await context.params; 

    // 2. multipart/form-data パース
    const formData = await request.formData();
    const metadataJson = formData.get('metadata');
    const imageFile = formData.get('image');

    // 3. バリデーション
    if (!metadataJson) {
      return NextResponse.json({ error: "Bad Request", details: "metadataが必要です。" }, { status: 400 });
    }

    let metadata;
    try {
      metadata = JSON.parse(metadataJson);
    } catch (e) {
      return NextResponse.json({ error: "Bad Request", details: "JSONが無効です。" }, { status: 400 });
    }

    const { status, details, captured_at } = metadata;
    if (!status || (status !== 'PASS' && status !== 'FAIL')) {
      return NextResponse.json({ error: "Bad Request", details: "status ('PASS' or 'FAIL') が必要です。" }, { status: 400 });
    }

    // --- ★復元: リトライロジック (最大5回トライ) ---
    let shotId = null;
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 500; // 0.5秒待機

    for (let i = 0; i < MAX_RETRIES; i++) {
      // 検索用の一時クエリ (pool.query は自動で接続管理を行うため安全)
      const findQuery = `SELECT id FROM inspection_camera_shots WHERE image_path LIKE $1`;
      const findResult = await pool.query(findQuery, [`%/${filename}`]);

      if (findResult.rows.length > 0) {
        shotId = findResult.rows[0].id;
        break; // 見つかったらループを抜ける
      }

      // 見つからなかった場合、まだリトライ回数が残っていれば待機
      if (i < MAX_RETRIES - 1) {
        console.log(`[API 7] データ検索中... (${i + 1}/${MAX_RETRIES}) filename: ${filename}`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    // リトライしても見つからなかった場合
    if (!shotId) {
      return NextResponse.json(
        { error: "Not Found", details: "指定された filename に一致する検査前データが見つかりません (タイムアウト)。" },
        { status: 404 }
      );
    }
    // -------------------------------------------

    // 4. ここから更新本番 (トランザクション開始)
    const client = await pool.connect(); 
    try {
      await client.query('BEGIN');

      // 画像保存 (任意)
      if (imageFile) {
        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        const savePath = path.join(SAVE_DIR_AFTER, filename);
        
        await mkdir(SAVE_DIR_AFTER, { recursive: true });
        await writeFile(savePath, imageBuffer);
      }

      // DB更新
      const updateQuery = `
        UPDATE inspection_camera_shots
        SET 
          status = $1, 
          details = $2,
          captured_at = COALESCE($3, captured_at) 
        WHERE 
          id = $4;
      `;
      await client.query(updateQuery, [
        status,
        details || null,
        captured_at || null,
        shotId
      ]);

      await client.query('COMMIT');

      return NextResponse.json({
        message: "検査結果を更新しました (リトライ成功)",
        filename: filename
      }, { status: 200 });

    } catch (innerError) {
      await client.query('ROLLBACK');
      throw innerError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('API Error (PUT result):', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}