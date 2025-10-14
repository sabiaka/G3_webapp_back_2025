import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * データベースに '2025-10-01' の 'alayer' データが存在するかを
 * 直接確認するためのデバッグ用API
 */
export async function GET() {
  try {
    // 前回確認をお願いした、特定のデータを探すためのSQLクエリ
    const debugQuery = `
      SELECT
        id,
        lot_id,
        section_code,
        captured_at
      FROM
        inspection_lots
      WHERE
        section_code = 'alayer' AND
        LEFT(captured_at::text, 10) = '2025-10-02';
    `;

    const result = await pool.query(debugQuery);

    // データベースから取得した結果を、加工せずにそのまま返す
    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('デバッグAPIでDBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。', error: error.message },
      { status: 500 }
    );
  }
}