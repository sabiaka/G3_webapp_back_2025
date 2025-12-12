import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { writeFile } from 'fs/promises';
import {
  buildBeforeImageUrl,
  normalizeBeforeImagePath,
  prepareImageTarget,
  removeImage,
  toAfterImageUrl,
} from '@/lib/image-storage';
import { emitEvent } from '@/lib/event-bus';

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

    // 3. バリデーション: multipart の必須パーツ
    const missingFormParts = [];
    if (!metadataJson) missingFormParts.push('metadata');
    if (!imageFile) missingFormParts.push('image');

    if (missingFormParts.length > 0) {
      return NextResponse.json(
        {
          error: "Bad Request",
          details: "multipart/form-data に必須パーツが不足しています。",
          missing_form_parts: missingFormParts,
        },
        { status: 400 }
      );
    }

    // 4. metadata (JSON) をパース
    let metadata;
    let metadataText;
    try {
      metadataText = typeof metadataJson === 'string'
        ? metadataJson
        : (metadataJson && typeof metadataJson.text === 'function'
            ? await metadataJson.text()
            : String(metadataJson));
      metadata = JSON.parse(metadataText);
    } catch (e) {
      const errMsg = (e && e.message) ? e.message : 'JSON パースエラー';
      return NextResponse.json(
        {
          error: "Bad Request",
          details: "metadata が有効な JSON ではありません。",
          parse_error: { message: errMsg },
        },
        { status: 400 }
      );
    }

    // 5. metadata の内容を検証
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json(
        {
          error: "Bad Request",
          details: "metadata はオブジェクト形式で指定してください。",
        },
        { status: 400 }
      );
    }

    const metadataRequirements = [
      { field: 'camera_id', label: 'camera_id' },
      { field: '4K_seq', label: '4K_seq' },
      { field: 'FHD_seq', label: 'FHD_seq' },
      { field: 'section_code', label: 'section_code' },
    ];

    const missingMetadataFields = metadataRequirements
      .filter(({ field }) => !metadata[field])
      .map(({ label }) => label);

    if (missingMetadataFields.length > 0) {
      return NextResponse.json(
        {
          error: "Bad Request",
          details: "metadata の必須項目が不足しています。",
          missing_fields: missingMetadataFields,
        },
        { status: 400 }
      );
    }

    const { camera_id, '4K_seq': c4k_seq, 'FHD_seq': fhd_seq, captured_at, section_code } = metadata;

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


    // ============================================================
    // 重複チェック
    // ============================================================
    const duplicateCheckQuery = `
      SELECT id FROM inspection_camera_shots 
      WHERE lot_id_ref = $1 
        AND camera_id = $2 
        AND c4k_seq = $3 
        AND fhd_seq = $4
      LIMIT 1;
    `;
    const duplicateResult = await client.query(duplicateCheckQuery, [
      lotIdRef, camera_id, c4k_seq, fhd_seq
    ]);

    if (duplicateResult.rows.length > 0) {
      const errorMessage = `重複エラー: カメラID '${camera_id}', 4K連番 '${c4k_seq}', FHD連番 '${fhd_seq}' のデータは既に登録されています。`;

      return NextResponse.json(
        { 
          error: "Conflict", 
          details: errorMessage,
          code: "DUPLICATE_ENTRY",
          conflicting_params: {
            lot_id: lotId,
            camera_id: camera_id,
            c4k_seq: c4k_seq,
            fhd_seq: fhd_seq
          }
        },
        { status: 409 }
      );
    }

    // 8. ファイル名を生成
    const filename = `${lotId}_${camera_id}_${c4k_seq}_${fhd_seq}.png`;
    const imageDbPath = buildBeforeImageUrl(filename);
    
    // 9. 画像ファイルをサーバーに保存
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const savePath = await prepareImageTarget(imageDbPath);
    await writeFile(savePath, imageBuffer);

    // 10. (DB処理 2) inspection_camera_shots にデータを INSERT
    const insertQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, camera_id, c4k_seq, fhd_seq, status, image_path, captured_at
      )
      VALUES ($1, $2, $3, $4, 'MISSING', $5, $6);
    `;
    await client.query(insertQuery, [
      lotIdRef, camera_id, c4k_seq, fhd_seq, imageDbPath, captured_at || new Date()
    ]);

    // ★修正: 設計書準拠のSSEイベント通知
    emitEvent({
      ivent: "inspection:imageUploaded",
      message: "検査前画像がアップロードされました"
    });

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
 */
export async function DELETE(request, { params }) {
  const client = await pool.connect(); 
  const lotId = params.lot_id; 
  
  try {
    await client.query('BEGIN');

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
    const lotIdRef = lotResult.rows[0].id;

    const shotsResult = await client.query(
      'SELECT image_path FROM inspection_camera_shots WHERE lot_id_ref = $1 AND image_path IS NOT NULL',
      [lotIdRef]
    );
    const imagePaths = shotsResult.rows.map(row => row.image_path);
    
    let deleteCount = 0;
    
    for (const dbPath of imagePaths) {
      let beforeImageUrl;
      try {
        beforeImageUrl = normalizeBeforeImagePath(dbPath);
      } catch (error) {
        console.error(`[DELETE] Invalid image path (${dbPath}):`, error);
        continue;
      }

      if (!beforeImageUrl) {
        continue;
      }

      try {
        if (await removeImage(beforeImageUrl)) {
          deleteCount++;
        }
      } catch (error) {
        console.error(`[DELETE] Error deleting BEFORE image (${beforeImageUrl}):`, error);
      }

      const afterImageUrl = toAfterImageUrl(beforeImageUrl);

      try {
        if (await removeImage(afterImageUrl)) {
          deleteCount++;
        }
      } catch (error) {
        console.error(`[DELETE] Error deleting AFTER image (${afterImageUrl}):`, error);
      }
    }

    const deleteLotQuery = 'DELETE FROM inspection_lots WHERE id = $1';
    await client.query(deleteLotQuery, [lotIdRef]);

    await client.query('COMMIT'); 

    // ★修正: 設計書準拠のSSEイベント通知
    emitEvent({
      ivent: "inspection:lotDeleted",
      message: "検査ロットが削除されました"
    });

    return NextResponse.json(
      { message: `ロット ${lotId} を削除しました。`, deleted_files: deleteCount },
      { status: 200 }
    );

  } catch (error) {
    await client.query('ROLLBACK'); 

    console.error(`API Fatal Error (DELETE lot ${lotId}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: 'ファイル削除処理中に予期せぬエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    client.release(); 
  }
}