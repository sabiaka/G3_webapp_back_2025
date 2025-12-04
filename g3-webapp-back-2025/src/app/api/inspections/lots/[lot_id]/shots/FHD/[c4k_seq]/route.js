import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API: FHDショット一覧 + ★進捗集計 (OK/NG率)
 * (GET /api/inspections/lots/{lot_id}/shots/FHD/{c4k_seq})
 * ★JSONキーを "c4k_seq" に変更
 */
export async function GET(request, context) {
  const { lot_id, c4k_seq } = await context.params; 
  
  try {
    // 1. lot_id 検索
    const lotResult = await pool.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1',
      [lot_id]
    );

    if (lotResult.rows.length === 0) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    const lotIdRef = lotResult.rows[0].id;

    // 2. FHDショット一覧を取得
    const shotsQuery = `
      SELECT
        camera_id,
        fhd_seq,
        shot_seq,
        status,
        details,
        image_path
      FROM
        inspection_camera_shots
      WHERE
        lot_id_ref = $1
        AND c4k_seq = $2
        AND fhd_seq IS NOT NULL
      ORDER BY
        id ASC;
    `;
    
    const shotsResult = await pool.query(shotsQuery, [lotIdRef, c4k_seq]);
    const shots = shotsResult.rows;

    // --- ★追加: 集計ロジック (Summary) ---
    const total = shots.length;
    let okCount = 0;
    let ngCount = 0;

    shots.forEach(shot => {
      if (shot.status === 'PASS') {
        okCount++;
      } else {
        // FAIL または MISSING は NG としてカウント
        ngCount++;
      }
    });

    // 比率計算 (0除算回避, 小数点第1位まで)
    const okRate = total > 0 ? Math.round((okCount / total) * 1000) / 10 : 0;
    const ngRate = total > 0 ? Math.round((ngCount / total) * 1000) / 10 : 0;
    // ------------------------------------

    // 3. 成功レスポンス
    return NextResponse.json({
      lot_id: lot_id,
      "c4k_seq": c4k_seq, // ★変更: キー名を "c4k_seq" に修正
      summary: {
        total: total,
        ok_count: okCount,
        ng_count: ngCount,
        ok_rate: okRate,
        ng_rate: ngRate
      },
      shots: shots
    });

  } catch (error) {
    console.error(`API Error (GET /shots/FHD/${lot_id}/${c4k_seq}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}