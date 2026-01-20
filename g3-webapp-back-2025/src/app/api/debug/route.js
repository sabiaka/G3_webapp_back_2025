/**
 * ファイル概要
 * ==========
 * このファイルは データベースの特定レコード有無 を直接確認するための簡易デバッグAPIを提供します。
 * 本番向けの業務APIではなく、検証用に限定して利用する想定です。
 */
 import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * データベースに '2025-10-01' の 'alayer' データが存在するかを
 * 直接確認するためのデバッグ用API
 * --------------------------------------
 * GET /api/debug
 *
 * 返却値（200）
 * - inspection_lots の生データ配列（id, lot_id, section_code, captured_at）
 *
 * エラー
 * - 500 サーバーエラー：DB接続やクエリ実行の失敗時。
 *
 * 実装メモ
 * - クエリは検証用の固定条件（section_code='alayer' かつ captured_at の日付が '2025-10-02'）。
 * - 取得結果は加工せずそのまま返し、調査のための生データ確認を優先します。
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