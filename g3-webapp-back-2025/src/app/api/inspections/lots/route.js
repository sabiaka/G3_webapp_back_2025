import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// 【追加】Next.jsのAPIキャッシュを強制的に無効化
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const dateParam = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // --- ステップ A: DBセッションを日本時間に設定 ---
    // これにより、以降のクエリでの時刻計算がすべて日本時間基準になります
    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    // --- ステップ B: 対象日付の決定 ---
    let targetDate = dateParam;
    if (!targetDate) {
      const latestResult = await pool.query(`
        SELECT to_char(captured_at, 'YYYY-MM-DD') as latest_date
        FROM inspection_lots
        ${section ? 'WHERE section_code = $1' : ''}
        ORDER BY captured_at DESC LIMIT 1
      `, section ? [section] : []);

      targetDate = latestResult.rows[0]?.latest_date || new Date().toLocaleDateString('sv-SE');
    }

    // --- ステップ C: 日付範囲の構築 ---
    // 文字列比較ではなく、時刻の範囲（00:00:00 ～ 23:59:59）で検索します
    // これがタイムゾーン問題を解決する最も確実な方法です
    const startOfDay = `${targetDate} 00:00:00`;
    const endOfDay = `${targetDate} 23:59:59`;

    let whereClause = "WHERE captured_at BETWEEN $1 AND $2";
    const queryParams = [startOfDay, endOfDay];

    if (section) {
      whereClause += ` AND section_code = $3`;
      queryParams.push(section);
    }

    // --- ステップ D: データの取得 ---
    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM inspection_lots ${whereClause}`, queryParams);
    const totalCount = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const lotsResult = await pool.query(`
      SELECT id, lot_id, section_code, captured_at
      FROM inspection_lots
      ${whereClause}
      ORDER BY captured_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);

    const lots = lotsResult.rows;

    if (lots.length === 0) {
      return NextResponse.json({ total_pages: totalPages, current_page: page, lots: [], debug_date: targetDate });
    }

    // --- ステップ E: ショット取得とレスポンス構築 (ロジックは維持) ---
    const lotIds = lots.map(l => l.id);
    const shotsResult = await pool.query(`
      SELECT lot_id_ref, camera_id, c4k_seq, status, image_path, id, captured_at
      FROM inspection_camera_shots
      WHERE lot_id_ref = ANY($1::bigint[])
      ORDER BY id ASC;
    `, [lotIds]);
    const allShots = shotsResult.rows;

    const responseLots = lots.map(lot => {
      const lotShots = allShots.filter(s => s.lot_id_ref === lot.id);
      let representativeImage = null;
      let displayCapturedAt = lot.captured_at;

      if (lotShots.length > 0) {
        const firstShot = lotShots[0];
        if (firstShot.captured_at) displayCapturedAt = firstShot.captured_at;
        representativeImage = firstShot.image_path?.replace('beforeTest', 'afterTest');
      }

      let pass = true;
      let details = {};
      if (lot.section_code === 'alayer') {
        const seqMap = new Map();
        lotShots.forEach(shot => {
          const k4 = shot.c4k_seq;
          if (!k4) return;
          if (shot.status === 'FAIL') { seqMap.set(k4, 'FAIL'); pass = false; }
          else if (shot.status === 'MISSING' && seqMap.get(k4) !== 'FAIL') { seqMap.set(k4, 'MISSING'); }
          else if (!seqMap.has(k4)) { seqMap.set(k4, 'PASS'); }
        });
        details.four_k_sequences = Array.from(seqMap.entries()).map(([k, v]) => ({ "c4k_seq": k, "status": v }));
      } else {
        const camMap = new Map();
        lotShots.forEach(shot => {
          const cam = shot.camera_id;
          if (shot.status === 'FAIL') { camMap.set(cam, 'FAIL'); pass = false; }
          else if (shot.status === 'MISSING' && camMap.get(cam) !== 'FAIL') { camMap.set(cam, 'MISSING'); }
          else if (!camMap.has(cam)) { camMap.set(cam, 'PASS'); }
        });
        details.cameras = Array.from(camMap.entries()).map(([k, v]) => ({ "camera_id": k, "status": v }));
      }

      return {
        lot_id: lot.lot_id,
        section: lot.section_code,
        captured_at: displayCapturedAt,
        pass: pass,
        representative_image: representativeImage,
        ...details
      };
    });

    return NextResponse.json({
      total_pages: totalPages,
      current_page: page,
      lots: responseLots
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}