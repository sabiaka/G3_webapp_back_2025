import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionCode = searchParams.get('section');
    const dateParam = searchParams.get('date');

    if (!sectionCode) return NextResponse.json({ message: 'section不足' }, { status: 400 });

    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    let targetDate = dateParam;
    if (!targetDate) {
      const latestResult = await pool.query(`
        SELECT to_char(s.captured_at, 'YYYY-MM-DD') as latest_date
        FROM inspection_camera_shots s
        INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
        WHERE l.section_code = $1
        ORDER BY s.captured_at DESC LIMIT 1
      `, [sectionCode]);
      targetDate = latestResult.rows[0]?.latest_date || new Date().toLocaleDateString('sv-SE');
    }

    const queryParams = [sectionCode, targetDate];

    // 【修正】l.captured_at ではなく s.captured_at で集計
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'PASS' OR s.status = 'OK') AS pass_count,
        COUNT(*) FILTER (WHERE s.status = 'FAIL' OR s.status = 'NG') AS fail_count
      FROM inspection_camera_shots s
      INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
      WHERE l.section_code = $1 AND to_char(s.captured_at, 'YYYY-MM-DD') = $2;
    `;

    const reasonsQuery = `
      SELECT
        s.details AS reason,
        COUNT(*) AS count
      FROM inspection_camera_shots s
      INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
      WHERE l.section_code = $1 AND to_char(s.captured_at, 'YYYY-MM-DD') = $2
      AND (s.status = 'FAIL' OR s.status = 'NG') AND s.details IS NOT NULL
      GROUP BY s.details ORDER BY count DESC;
    `;

    const [sumRes, reasRes] = await Promise.all([
      pool.query(summaryQuery, queryParams),
      pool.query(reasonsQuery, queryParams)
    ]);

    const passCount = parseInt(sumRes.rows[0]?.pass_count || '0', 10);
    const failCount = parseInt(sumRes.rows[0]?.fail_count || '0', 10);
    const totalCount = passCount + failCount;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    return NextResponse.json({
      section: sectionCode,
      date: targetDate,
      total_count: totalCount,
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: passRate,
      fail_reasons: reasRes.rows,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'Internal Error' }, { status: 500 });
  }
}