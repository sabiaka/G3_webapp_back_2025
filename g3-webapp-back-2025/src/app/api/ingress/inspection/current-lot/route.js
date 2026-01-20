/**
 * ファイルの役割:
 *   指定セクションの最新ロットIDを返すAPIルート。
 *   captured_atで降順に並べて先頭1件を返す。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール

/**
 * API: 11. 現在生産中の lot_id を取得
 * (GET /api/ingress/inspection/current-lot?section={section})
 *
 * 説明:
 *   section_codeでフィルタし、最新のロットIDを1件返す。
 *
 * I/O:
 *   @param {Request} request                                   - クエリにsectionを含むリクエスト
 *   @returns {NextResponse}                                     - JSON: { lot_id } もしくは 204
 *
 * ステータス:
 *   200                                                         - 見つかった
 *   204                                                         - 見つからない
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー
 */
export async function GET(request) {
  
  try {
    // 1. クエリパラメータ（section）を取得
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    // 2. バリデーション (section は必須)
    if (!section) {
      return NextResponse.json(
        { error: "Bad Request", details: ["クエリパラメータ 'section' は必須です。"] },
        { status: 400 }
      );
    }
    if (section !== 'spring' && section !== 'alayer') {
      return NextResponse.json(
        { error: "Bad Request", details: ["'section' は 'spring' または 'alayer' を指定してください。"] },
        { status: 400 }
      );
    }

    // 3. DBクエリの実行
    // (API 5 と同じロジックで、指定セクションの "最新" の lot_id を1件取得)
    const query = `
      SELECT lot_id 
      FROM inspection_lots
      WHERE section_code = $1
      ORDER BY captured_at DESC
      LIMIT 1;
    `;
    
    const result = await pool.query(query, [section]);

    // 4. 成功レスポンス (200 OK または 204 No Content)
    if (result.rows.length > 0) {
      // 見つかった場合 (200 OK)
      return NextResponse.json({
        lot_id: result.rows[0].lot_id
      });
    } else {
      // 見つからなかった場合 (204 No Content)
      return NextResponse.json(
        { message: "現在生産しているロットはありません。" },
        { status: 204 } // 204 はボディを持たないのが一般的だが、設計書 に合わせてJSONを返す
      );
    }

  } catch (error) {
    console.error('API Error (GET current-lot):', error);
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
  // (pool.connect() ではなく pool.query() を使ったため、client.release() は不要)
}