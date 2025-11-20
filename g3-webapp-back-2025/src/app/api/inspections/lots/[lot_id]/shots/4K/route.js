import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API 3.1: 4Kショット一覧（重複排除）
 * (GET /api/inspections/lots/{lot_id}/shots/4K)
 *
 */
export async function GET(request, context) {
  const { lot_id } = await context.params; // URLから {lot_id} を取得
  
  try {
    // 1. lot_id (文字列) から 親ロットの内部ID (lot_id_ref) を検索
    const lotResult = await pool.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1',
      [lot_id]
    );

    if (lotResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Not Found", details: `指定された lot_id (${lot_id}) が見つかりません。` },
        { status: 404 }
      );
    }
    const lotIdRef = lotResult.rows[0].id; // 内部ID (e.g., 88)

    // --- ▼ 変更点: SELECTリストを設計書に合わせる ▼ ---
    //
    const distinctQuery = `
      SELECT DISTINCT ON (c4k_seq)
        -- id, -- (削除)
        camera_id,
        c4k_seq,
        -- fhd_seq, -- (削除)
        shot_seq,
        status,
        details,
        image_path
        -- captured_at -- (削除)
      FROM
        inspection_camera_shots
      WHERE
        lot_id_ref = $1
        AND c4k_seq IS NOT NULL
      ORDER BY
        c4k_seq ASC, id DESC; -- (id DESCは「最新ショット」の重複排除ロジック のために必要)
    `;
    // --- ▲ 変更点 ▲ ---

    const shotsResult = await pool.query(distinctQuery, [lotIdRef]);

    // 3. 成功レスポンス
    return NextResponse.json({
      lot_id: lot_id,
      shots: shotsResult.rows // "shots" 配列
    });

  } catch (error) {
    console.error(`API Error (GET /shots/4K/${lot_id}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}