import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API: FHDショット一覧（4K_seqで絞り込み）
 * (GET /api/inspections/lots/{lot_id}/shots/FHD/{4k_seq})
 *
 */
export async function GET(request, { params }) {
  // URLから {lot_id} と {c4k_seq} を取得
  const { lot_id, c4k_seq } = params; 
  
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

    // 2. FHDショット一覧を取得
    // (c4k_seq が一致し、fhd_seq を持つものを検索)
    // --- ▼ 変更点: SELECTリストを設計書 に合わせる ▼ ---
    const shotsQuery = `
      SELECT
        -- id, -- (削除)
        camera_id,
        -- c4k_seq, -- (削除: ルートレベルで返すため)
        fhd_seq,
        shot_seq,
        status,
        details,
        image_path
        -- captured_at -- (削除)
      FROM
        inspection_camera_shots
      WHERE
        lot_id_ref = $1
        AND c4k_seq = $2
        AND fhd_seq IS NOT NULL
      ORDER BY
        id ASC; -- (古い順 / 撮影順)
    `;
    // --- ▲ 変更点 ▲ ---
    
    const shotsResult = await pool.query(shotsQuery, [lotIdRef, c4k_seq]);

    // 3. 成功レスポンス (設計書 通り)
    return NextResponse.json({
      lot_id: lot_id,
      "4k_seq": c4k_seq, // レスポンスJSON に合わせる
      shots: shotsResult.rows // "shots" 配列
    });

  } catch (error) {
    console.error(`API Error (GET /shots/FHD/${lot_id}/${c4k_seq}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}