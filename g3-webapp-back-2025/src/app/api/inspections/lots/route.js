import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Next.jsのキャッシュを無効化し、常に最新のDB状態を反映
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const dateParam = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // 1. DBセッションを日本時間に設定
    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    // 2. 検索対象の日付を決定
    let targetDate = dateParam;
    if (!targetDate) {
      // 日付未指定の場合、「検査が開始された最新の日」を取得
      const latestResult = await pool.query(`
        SELECT to_char(MIN(s.captured_at), 'YYYY-MM-DD') as latest_date
        FROM inspection_camera_shots s
        INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
        ${section ? 'WHERE l.section_code = $1' : ''}
        GROUP BY l.id 
        ORDER BY MIN(s.captured_at) DESC LIMIT 1
      `, section ? [section] : []);

      targetDate = latestResult.rows[0]?.latest_date || new Date().toLocaleDateString('sv-SE');
    }

    // 3. クエリ条件の構築
    // 【核心】「ショットの最小時刻」が指定日と一致するロットのみを抽出（重複防止）
    let whereClause = `
      WHERE (
        SELECT to_char(MIN(s.captured_at), 'YYYY-MM-DD')
        FROM inspection_camera_shots s
        WHERE s.lot_id_ref = inspection_lots.id
      ) = $1
    `;
    const queryParams = [targetDate];

    if (section) {
      whereClause += ` AND section_code = $2`;
      queryParams.push(section);
    }

    // 4. 総件数の取得
    const countQuery = `SELECT COUNT(*) AS total FROM inspection_lots ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalCount / limit);

    // 5. ロット一覧の取得（開始時刻の降順）
    const lotsQuery = `
      SELECT id, lot_id, section_code, captured_at
      FROM inspection_lots
      ${whereClause}
      ORDER BY (SELECT MIN(captured_at) FROM inspection_camera_shots WHERE lot_id_ref = inspection_lots.id) DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    const lotsResult = await pool.query(lotsQuery, [...queryParams, limit, offset]);
    const lots = lotsResult.rows;

    if (lots.length === 0) {
      return NextResponse.json({ total_pages: totalPages, current_page: page, lots: [] });
    }

    // 6. ショット詳細の取得
    const lotIds = lots.map(l => l.id);
    const shotsResult = await pool.query(`
      SELECT lot_id_ref, camera_id, c4k_seq, status, image_path, id, captured_at
      FROM inspection_camera_shots
      WHERE lot_id_ref = ANY($1::bigint[])
      ORDER BY id ASC;
    `, [lotIds]);
    const allShots = shotsResult.rows;

    // 7. レスポンス用データの整形
    const responseLots = lots.map(lot => {
      const lotShots = allShots.filter(s => s.lot_id_ref === lot.id);
      
      // 表示用時刻は「最初のショットの時刻」を絶対基準にする
      const displayCapturedAt = lotShots.length > 0 ? lotShots[0].captured_at : lot.captured_at;
      const representativeImage = lotShots.length > 0 
        ? lotShots[0].image_path?.replace('beforeTest', 'afterTest') 
        : null;

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