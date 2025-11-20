import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール
import { writeFile, mkdir, unlink } from 'fs/promises'; // 画像保存・削除用
import path from 'path'; // パス結合用

// --- 定数 ---
// API 6 (POST) の保存先フォルダ
const IMAGE_DIR_BEFORE = '/imageDB/beforeTest/'; 
const SAVE_DIR_BEFORE = path.join(process.cwd(), 'public', IMAGE_DIR_BEFORE);
// API 13 (DELETE) で使用するフォルダ
const BASE_DIR = path.join(process.cwd(), 'public'); 

// ------------------------------------------------------------
// 1. POST 関数 (API 6: 【検査前】画像アップロード)
// ------------------------------------------------------------
/**
 * API: 6. 【検査前】画像アップロード（lot_id指定・単発）(A層検査用)
 * (POST /api/ingress/inspection/{lot_id})
 */
export async function POST(request, { params }) {
  let client; 
  const lotId = params.lot_id; 

  try {
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
      return NextResponse.json({ error: "Bad Request", details: "metadata が有効な JSON ではありません。" }, { status: 400 });
    }

    // 5. metadata の内容を検証 (API 6 の仕様)
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
    const lotIdRef = lotResult.rows[0].id; 

    // 8. ファイル名を生成 (設計書セクション6のルール)
    const filename = `${lotId}_${camera_id}_${c4k_seq}_${fhd_seq}.png`;
    
    // 9. 画像ファイルをサーバーに保存
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const savePath = path.join(SAVE_DIR_BEFORE, filename); // 検査前フォルダに保存
    
    await mkdir(SAVE_DIR_BEFORE, { recursive: true });
    await writeFile(savePath, imageBuffer);

    // 10. (DB処理 2) inspection_camera_shots にデータを INSERT
    const imageDbPath = path.join(IMAGE_DIR_BEFORE, filename).replace(/\\/g, '/');
    const insertQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, camera_id, c4k_seq, fhd_seq, status, image_path, captured_at
      )
      VALUES ($1, $2, $3, $4, 'MISSING', $5, $6);
    `;
    await client.query(insertQuery, [
      lotIdRef, camera_id, c4k_seq, fhd_seq, imageDbPath, captured_at || new Date()
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
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}

// ------------------------------------------------------------
// 2. DELETE 関数 (API 13: 特定ロットの削除)
// ------------------------------------------------------------
/**
 * API: 13. 特定ロットの削除 (DB + 画像ファイル)
 * (DELETE /api/ingress/inspection/{lot_id})
 *
 */
export async function DELETE(request, { params }) {
  const client = await pool.connect(); // トランザクションのために接続を専有
  const lotId = params.lot_id; // URLパスから {lot_id} を取得
  
  try {
    // 1. トランザクション開始
    await client.query('BEGIN');

    // 2. lot_id から親ロットの内部ID (lot_id_ref) を取得
    const lotResult = await client.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1',
      [lotId]
    );

    if (lotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: "Not Found", details: `指定された lot_id (${lotId}) が見つかりません。` },
        { status: 404 }
      );
    }
    const lotIdRef = lotResult.rows[0].id; // 親ロットの内部ID

    // 3. 削除対象となる画像パスをすべて取得
    const shotsResult = await client.query(
      'SELECT image_path FROM inspection_camera_shots WHERE lot_id_ref = $1 AND image_path IS NOT NULL',
      [lotIdRef]
    );
    const imagePaths = shotsResult.rows.map(row => row.image_path);
    
    // 4. 物理ファイル削除 (検査前 / 検査後)
    let deleteCount = 0;
    
    for (const dbPath of imagePaths) {
      // a. 検査前画像パスを構築
      const beforePath = path.join(BASE_DIR, dbPath);
      // b. 検査後画像パスを構築 (beforeTest -> afterTest に置換)
      const afterPath = path.join(BASE_DIR, dbPath.replace('beforeTest', 'afterTest'));

      // ★ ファイルが存在しなくても API は成功させる ★
      try {
        await unlink(beforePath); // 検査前画像を削除
        deleteCount++;
      } catch (e) {
        if (e.code !== 'ENOENT') { console.error(`[DELETE] Error deleting BEFORE image (${beforePath}):`, e); }
      }
      
      try {
        await unlink(afterPath); // 検査後画像を削除
        deleteCount++;
      } catch (e) {
        if (e.code !== 'ENOENT') { console.error(`[DELETE] Error deleting AFTER image (${afterPath}):`, e); }
      }
    }

    // 5. データベースからデータを削除
    // inspection_lots を削除すれば ON DELETE CASCADE で子テーブルも自動削除
    const deleteLotQuery = 'DELETE FROM inspection_lots WHERE id = $1';
    await client.query(deleteLotQuery, [lotIdRef]);

    // 6. トランザクション確定
    await client.query('COMMIT'); 

    // 7. 成功レスポンス
    return NextResponse.json(
      { message: `ロット ${lotId} を削除しました。`, deleted_files: deleteCount },
      { status: 200 }
    );

  } catch (error) {
    // 予期せぬDBエラーやファイルパス生成エラーなどが発生した場合
    await client.query('ROLLBACK'); 

    // 予期せぬエラーは 500 を返す
    console.error(`API Fatal Error (DELETE lot ${lotId}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: 'ファイル削除処理中に予期せぬエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    client.release(); // 接続をプールに返却
  }
}