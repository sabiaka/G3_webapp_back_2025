import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 特定のロットIDに紐づくショットの一覧を取得する (GET)
 * @param {Request} request Next.jsから渡されるリクエストオブジェクト
 * @param {object} context URLの動的パラメータを含むオブジェクト
 * @param {object} context.params URLの動的パラメータ
 * @param {string} context.params.lot_id URLから取得したロットID
 */
export async function GET(request, { params }) {
  try {
    // 1. URLから動的なロットIDを取得
    const { lot_id } = params;

    if (!lot_id) {
      return NextResponse.json(
        { message: 'ロットIDが指定されていません。' },
        { status: 400 }
      );
    }

    // 2. データベースから該当するショットの一覧を取得
    const shotsQuery = `
      SELECT
          s.camera_id,
          s.status,
          s.details,
          s.image_path
      FROM
          inspection_camera_shots AS s
      INNER JOIN
          inspection_lots AS l ON s.lot_id_ref = l.id
      WHERE
          l.lot_id = $1
      ORDER BY
          s.camera_id, s.shot_seq;
    `;

    const shotsResult = await pool.query(shotsQuery, [lot_id]);

    // 3. 仕様書通りのフォーマットでレスポンスを組み立てる
    const responseData = {
      lot_id: lot_id,
      shots: shotsResult.rows,
    };
    
    // もし指定されたlot_idに紐づくショットが1件もなくても、
    // 404 Not Foundではなく、空の配列を持つ200 OKを返すのが一般的です。
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}