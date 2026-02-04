import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const dateParam = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    // A. 対象日付の決定 (ショットの最小時刻を基準にする)
    let targetDate = dateParam;
    if (!targetDate) {
      const latestResult = await pool.query(`
        SELECT to_char(MIN(s.captured_at), 'YYYY-MM-DD') as latest_date
        FROM inspection_camera_shots s
        INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
        ${section ? 'WHERE l.section_code = $1' : ''}
        GROUP BY l.id ORDER BY MIN(s.captured_at) DESC LIMIT 1
      `, section ? [section] : []);
      targetDate = latestResult.rows[0]?.latest_date || new Date().toLocaleDateString('sv-SE');
    }

    const startOfDay = `${targetDate} 00:00:00`;
    const endOfDay = `${targetDate} 23:59:59`;

    // 【核心の修正】ロット内の「最小のcaptured_at（最初の1枚）」が指定日にあるロットのみを抽出
    let whereClause = `
      WHERE (
        SELECT MIN(s.captured_at) 
        FROM inspection_camera_shots s 
        WHERE s.lot_id_ref = inspection_lots.id
      ) BETWEEN $1 AND $2
    `;
    const queryParams = [startOfDay, endOfDay];

    if (section) {
      whereClause += ` AND section_code = $3`;
      queryParams.push(section);
    }

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM inspection_lots ${whereClause}`, queryParams);
    const totalCount = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const lotsResult = await pool.query(`
      SELECT id, lot_id, section_code, captured_at
      FROM inspection_lots
      ${whereClause}
      ORDER BY (SELECT MIN(captured_at) FROM inspection_camera_shots WHERE lot_id_ref = inspection_lots.id) DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);

    const lots = lotsResult.rows;

    if (lots.length === 0) {
      return NextResponse.json({ total_pages: totalPages, current_page: page, lots: [] });
    }

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
      let displayCapturedAt = lot.captured_at;
      let representativeImage = null;

      if (lotShots.length > 0) {
        displayCapturedAt = lotShots[0].captured_at; // カードに表示される日付
        representativeImage = lotShots[0].image_path?.replace('beforeTest', 'afterTest');
      }

      let pass = true;
      let details = {};
      if (lot.section_code === 'alayer') {
        const seqMap = new Map();
        lotShots.forEach(shot => {
          const k = shot.c4k_seq; if (!k) return;
          if (shot.status === 'FAIL') { seqMap.set(k, 'FAIL'); pass = false; }
          else if (shot.status === 'MISSING' && seqMap.get(k) !== 'FAIL') seqMap.set(k, 'MISSING');
          else if (!seqMap.has(k)) seqMap.set(k, 'PASS');
        });
        details.four_k_sequences = Array.from(seqMap.entries()).map(([k, v]) => ({ "c4k_seq": k, "status": v }));
      } else {
        const camMap = new Map();
        lotShots.forEach(shot => {
          const c = shot.camera_id;
          if (shot.status === 'FAIL') { camMap.set(c, 'FAIL'); pass = false; }
          else if (shot.status === 'MISSING' && camMap.get(c) !== 'FAIL') camMap.set(c, 'MISSING');
          else if (!camMap.has(c)) camMap.set(c, 'PASS');
        });
        details.cameras = Array.from(camMap.entries()).map(([k, v]) => ({ "camera_id": k, "status": v }));
      }

      return { lot_id: lot.lot_id, section: lot.section_code, captured_at: displayCapturedAt, pass, representative_image: representativeImage, ...details };
    });

    return NextResponse.json({ total_pages: totalPages, current_page: page, lots: responseLots });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}