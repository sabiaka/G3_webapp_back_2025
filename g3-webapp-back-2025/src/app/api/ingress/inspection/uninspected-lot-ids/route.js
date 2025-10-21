import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続 (db.queryが直接使えることを想定)
import { URL } from 'url';

/**
 * 9. 未検査ロットIDと画像ファイルパスの取得 (GET)
 * ?section=... クエリに基づいて、'MISSING' のショットを返す
 */
export async function GET(request) {
  try {
    // 1. URLからクエリパラメータを取得
    // 'request.url' から 'searchParams' を正しく取得
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    // 2. section パラメータのバリデーション
    if (!section) {
      return NextResponse.json(
        { "error": "Bad Request", "details": "クエリパラメータ 'section' は必須です。" },
        { status: 400 }
      );
    }

    // 3. DBクエリの実行
    // 'inspection_lots' と 'inspection_camera_shots' を結合
    // 'section_code' と 'status' で絞り込み、'lot_id' ごとに 'image_path' を配列にまとめる
    const query = `
      SELECT
        l.lot_id,
        json_agg(s.image_path) AS image_paths
      FROM
        inspection_lots AS l
      JOIN
        inspection_camera_shots AS s ON l.id = s.lot_id_ref
      WHERE
        l.section_code = $1
        AND s.status = 'MISSING'
      GROUP BY
        l.lot_id
      ORDER BY
        l.lot_id;
    `;

    const result = await db.query(query, [section]);

    // 4. 成功レスポンスを返す
    // result.rows は [ { lot_id: "...", image_paths: [...] }, ... ] という形になっている
    return NextResponse.json(
      { "lots": result.rows },
      { status: 200 }
    );

  } catch (error) {
    console.error('[API ERROR] /api/ingress/inspection/uninspected-lot-ids:', error);
    return NextResponse.json(
      { "error": "Internal Server Error", "details": error.message },
      { status: 500 }
    );
  }
}