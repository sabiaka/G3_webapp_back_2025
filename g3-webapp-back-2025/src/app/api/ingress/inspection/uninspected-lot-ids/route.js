/**
 * ファイルの役割:
 *   指定セクションで未検査(MISSING)のロット一覧を返すAPIルート。
 *   ロットごとに未検査のimage_pathを配列で集約して返す。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール

/**
 * API: 9. 未検査ロットIDと画像ファイルパスの取得
 * (GET /api/ingress/inspection/uninspected-lot-ids?section={section})
 *
 * 説明:
 *   セクション内で `status = 'MISSING'` のショットに紐づくロットを集約し、古い順に返す。
 *
 * I/O:
 *   @param {Request} request                                   - クエリにsectionを含むリクエスト
 *   @returns {NextResponse}                                     - JSON: { lots: Array<{ lot_id, image_paths: string[] }> }
 *
 * ステータス:
 *   200                                                         - 取得成功
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
    // (JOINして 'section' で絞り込み、'MISSING' ステータス のものを検索)
    const query = `
      SELECT
          l.lot_id,
          -- 'MISSING' 状態の image_path を配列として集約
          -- (NULLでないパスのみを集約)
          COALESCE(
            ARRAY_AGG(s.image_path) FILTER (WHERE s.image_path IS NOT NULL), 
            '{}'::TEXT[] -- 1件もパスがない場合は空配列 '{}' を返す
          ) AS image_paths
      FROM
          inspection_camera_shots s
      INNER JOIN
          inspection_lots l ON s.lot_id_ref = l.id
      WHERE
          l.section_code = $1     -- 1. 'section' で絞り込み
          AND s.status = 'MISSING'  -- 2. "未検査" ('MISSING') で絞り込み
      GROUP BY
          l.lot_id, l.captured_at
      ORDER BY
          l.captured_at ASC;      -- 3. 古い順 (昇順)
    `;
    
    const result = await pool.query(query, [section]);

    // 4. 成功レスポンス (設計書通りの { "lots": [...] } 形式)
    return NextResponse.json({
      lots: result.rows 
    });

  } catch (error) {
    console.error('API Error (GET uninspected-lot-ids):', error);
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
  // (pool.connect() ではなく pool.query() を使ったため、client.release() は不要)
}