import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 指定されたセクションと日付に紐付くロット一覧を取得するAPI
 * 修正内容: 親テーブルの日付ではなく、ショットデータの最新日付でフィルタリングします。
 */
export async function GET(request, { params }) {
  try {
    const { section } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // フロントから渡される '2026-01-27' などの値

    if (!section) {
      return NextResponse.json({ message: 'セクション指定が必要です' }, { status: 400 });
    }

    // 修正ポイント: 
    // 1. inspection_camera_shots (s) を結合
    // 2. MAX(s.captured_at) でそのロットの本当の最終日時を取得
    // 3. HAVING句を使って、最新ショットの日付が指定日(date)と一致するものだけを抽出
    let query = `
      SELECT 
          l.id,
          l.lot_id,
          l.section_code,
          to_char(MAX(s.captured_at) AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS captured_at,
          COUNT(s.id) as shot_count
      FROM 
          inspection_lots l
      JOIN 
          inspection_camera_shots s ON l.id = s.lot_id_ref
      WHERE 
          l.section_code = $1
      GROUP BY 
          l.id, l.lot_id, l.section_code
    `;

    const queryParams = [section];

    if (date) {
      // 親の日付ではなく、子の最新日付(MAX)で絞り込み
      query += `
        HAVING 
            to_char(MAX(s.captured_at) AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = $2
      `;
      queryParams.push(date);
    }

    query += ` ORDER BY captured_at DESC;`;

    const result = await pool.query(query, queryParams);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('ロット一覧取得エラー:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}