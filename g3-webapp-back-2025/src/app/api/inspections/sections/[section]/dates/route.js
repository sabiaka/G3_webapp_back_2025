import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 日時一覧取得 (GET)
 * 修正内容: ロットごとの最新ショット日から、重複のない「日付リスト」を取得します。
 */
export async function GET(request, { params }) {
  try {
    const { section } = await params;

    if (!section) {
      return NextResponse.json(
        { message: 'セクションが指定されていません。' },
        { status: 400 }
      );
    }

    // 修正ポイント: 
    // 1. フォーマットを 'YYYY-MM-DD' に変更
    // 2. DISTINCT を使い、1日に複数ロットあっても日付が重複しないようにする
    const datesQuery = `
      SELECT DISTINCT
          to_char(MAX(s.captured_at) AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS inspection_date
      FROM
          inspection_lots l
      JOIN 
          inspection_camera_shots s ON l.id = s.lot_id_ref
      WHERE
          l.section_code = $1
      GROUP BY
          l.id
      ORDER BY
          inspection_date DESC;
    `;

    const result = await pool.query(datesQuery, [section]);
    
    // row.inspection_date の中身は "2026-01-27" のような形式になります
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