/**
 * ファイルの役割:
 *   セクション内でデータが存在する日付一覧(降順)を返すAPI。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 日付一覧取得 (GET)
 *
 * 説明:
 *   section_codeでフィルタし、captured_atの日付(YYYY-MM-DD)の重複を除いて返す。
 *
 * I/O:
 *   @param {Request} request                                   - リクエスト
 *   @param {{ params: { section: string } }} context           - パスパラメータ
 *   @returns {NextResponse}                                     - JSON: { section, dates }
 *
 * ステータス:
 *   200                                                         - 成功
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー
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