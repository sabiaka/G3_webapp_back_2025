import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request, { params }) {
  const { section } = params;

  if (!section) {
    return NextResponse.json({ error: 'Section is required' }, { status: 400 });
  }

  try {
    // 【修正ポイント】
    // inspection_lots (親) ではなく、inspection_camera_shots (子/写真) の時刻を参照します。
    // これにより、一覧APIが表示している「代表画像の時刻」と、カレンダーの日付が完全に一致します。
    
    const query = `
      SELECT DISTINCT
        to_char(T1.captured_at + interval '9 hours', 'YYYY-MM-DD') as date_val
      FROM inspection_camera_shots T1
      INNER JOIN inspection_lots T2 ON T1.lot_id_ref = T2.id
      WHERE T2.section_code = $1
        AND T1.captured_at IS NOT NULL
      ORDER BY date_val DESC
    `;

    const result = await pool.query(query, [section]);
    const dates = result.rows.map(row => row.date_val);

    return NextResponse.json({
      section,
      dates
    });

  } catch (error) {
    console.error('API Error (GET dates summary):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}