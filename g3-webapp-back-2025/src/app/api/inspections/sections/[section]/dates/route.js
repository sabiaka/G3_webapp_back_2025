import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const { section } = params;

    if (!section) {
      return NextResponse.json(
        { message: 'セクションが指定されていません。' },
        { status: 400 }
      );
    }

    const datesQuery = `
      SELECT DISTINCT
          -- ★ タイムゾーン変換せず、単純にYYYY-MM-DD形式の文字列として抽出
          to_char(captured_at, 'YYYY-MM-DD') AS inspection_date
      FROM
          inspection_lots
      WHERE
          section_code = $1
      ORDER BY
          inspection_date DESC;
    `;

    const result = await pool.query(datesQuery, [section]);
    const dates = result.rows.map(row => row.inspection_date);

    const responseData = {
      section: section,
      dates: dates,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}