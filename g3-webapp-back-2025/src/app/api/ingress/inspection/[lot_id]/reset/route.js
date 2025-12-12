import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { normalizeAfterImagePath, removeImage } from '@/lib/image-storage';
import { emitEvent } from '@/lib/event-bus';

/**
 * API: 12. 検査ステータスのリセット (再検査の初期化)
 * (POST /api/ingress/inspection/{lot_id}/reset)
 */
export async function POST(request, { params }) {
  const client = await pool.connect();
  const lotId = params.lot_id;

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
    const lotIdRef = lotResult.rows[0].id;

    // 3. (DB処理 1 - SELECT) リセット対象の image_path を取得
    //    (DBのimage_pathは常に 'beforeTest' のパスが入っている前提)
    const selectPathsQuery = `
      SELECT image_path
      FROM inspection_camera_shots
      WHERE lot_id_ref = $1 AND status != 'MISSING' AND image_path IS NOT NULL;
    `;
    const pathsResult = await client.query(selectPathsQuery, [lotIdRef]);
    const pathsToReset = pathsResult.rows.map(row => row.image_path);

    // 4. (DB処理 2 - UPDATE) ステータスをリセットし、更新件数を取得
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET 
        status = 'MISSING',
        details = NULL
      WHERE 
        lot_id_ref = $1 
        AND status != 'MISSING';
    `;
    const updateResult = await client.query(updateQuery, [lotIdRef]);
    const updatedCount = updateResult.rowCount;

    // 5. 物理ファイル削除 (検査後画像のみ)
    for (const dbPath of pathsToReset) {
      let afterImageUrl;
      try {
        afterImageUrl = normalizeAfterImagePath(dbPath);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[RESET] Invalid image path (${dbPath}):`, error);
        return NextResponse.json(
          { error: 'Internal Server Error', details: '画像パスの解析に失敗しました。' },
          { status: 500 }
        );
      }

      if (!afterImageUrl) {
        continue;
      }

      try {
        await removeImage(afterImageUrl);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[DELETE] Error deleting AFTER image (${afterImageUrl}):`, error);
        return NextResponse.json(
          { error: 'Internal Server Error', details: `ファイル削除中にエラーが発生しました。詳細: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // 6. トランザクション確定
    await client.query('COMMIT');

    // ★修正: 設計書準拠のSSEイベント通知
    emitEvent({
      ivent: "inspection:lotReset",
      message: "検査ロットがリセットされました"
    });

    // 7. 成功レスポンス
    return NextResponse.json(
      {
        message: "検査ステータスをリセットしました。",
        lot_id: lotId,
        updated_count: updatedCount
      },
      { status: 200 }
    );

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error(`API Fatal Error (POST lot ${lotId}/reset):`, error);
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