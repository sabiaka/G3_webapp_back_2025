/**
 * ファイルの役割:
 * セクション内でデータが存在する日時一覧(降順)を返すAPI。
 * DB上のUTC時刻を日本時間(JST)に変換して取得します。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 日時一覧取得 (GET)
 *
 * 説明:
 * section_codeでフィルタし、captured_atを日本時間に変換した上での
 * 重複を除いた日時(YYYY-MM-DD HH24:MI)のリストを返す。
 *
 * I/O:
 * @param {Request} request                                   - リクエスト
 * @param {{ params: { section: string } }} context           - パスパラメータ
 * @returns {NextResponse}                                     - JSON: { section, dates }
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

    const datesQuery = `
      SELECT DISTINCT
          -- UTCで保存されているcaptured_atを日本時間(Asia/Tokyo)に変換し、
          -- 分単位までの文字列として抽出します。
          to_char(captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS inspection_date
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