import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * API: セクションごとの「データが存在する日付一覧」を取得
 * ロジック: 各ロットの「最小の画像時刻（検査開始日）」を抽出して一覧化する
 */
export async function GET(request, { params }) {
  try {
    const { sectionCode } = params;

    if (!sectionCode) {
      return NextResponse.json({ message: 'sectionCode不足' }, { status: 400 });
    }

    // セッションを日本時間に設定
    await pool.query("SET TIME ZONE 'Asia/Tokyo'");

    // 【核心の修正】
    // 1. 各ロット(l.id)ごとの最小の画像時刻(MIN(s.captured_at))を求める
    // 2. それを日付形式('YYYY-MM-DD')に変換して重複を排除(DISTINCT)する
    const query = `
      SELECT DISTINCT to_char(min_captured_at, 'YYYY-MM-DD') AS date
      FROM (
        SELECT MIN(s.captured_at) AS min_captured_at
        FROM inspection_camera_shots s
        INNER JOIN inspection_lots l ON s.lot_id_ref = l.id
        WHERE l.section_code = $1
        GROUP BY l.id
      ) AS lot_starts
      ORDER BY date DESC;
    `;

    const result = await pool.query(query, [sectionCode]);
    const dates = result.rows.map(row => row.date);

    return NextResponse.json({
      section: sectionCode,
      dates: dates
    });

  } catch (error) {
    console.error('API Error (Get Dates):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}