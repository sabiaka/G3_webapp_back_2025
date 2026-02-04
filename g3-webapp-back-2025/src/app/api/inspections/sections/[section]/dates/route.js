import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { sectionCode } = params;
    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    // 【修正】ロットの登録日ではなく、「各ロットの最初の画像時刻」を日付として抽出
    const query = `
      SELECT DISTINCT to_char(min_at, 'YYYY-MM-DD') AS date
      FROM (
        SELECT MIN(s.captured_at) as min_at
        FROM inspection_camera_shots s
        INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
        WHERE l.section_code = $1
        GROUP BY l.id
      ) AS t
      ORDER BY date DESC;
    `;

    const result = await pool.query(query, [sectionCode]);
    return NextResponse.json({
      section: sectionCode,
      dates: result.rows.map(r => r.date)
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}