/**
 * ファイルの役割:
 *   特定ロットに紐づくショット一覧を返すAPI。
 *   親ロットの代表時刻も併せて返す。
 */
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
  /**
   * 説明:
   *   lot_idでロットを特定し、紐づくショットを取得して返す。
   *
   * I/O:
   *   @param {Request} request                                 - リクエスト
   *   @param {{ params: { lot_id: string } }} context          - パスパラメータ
   *   @returns {NextResponse}                                   - JSON: { lot_id, captured_at, shots }
   */
  try {
    // 1. URLから動的なロットIDを取得
    const { lot_id } = await params;

    if (!lot_id) {
      return NextResponse.json(
        { message: 'ロットIDが指定されていません。' },
        { status: 400 }
      );
    }

    // 2. 代表時刻（ロットのcaptured_at）を取得
    const lotCapturedAtQuery = `
      SELECT captured_at
      FROM inspection_lots
      WHERE lot_id = $1
      LIMIT 1;
    `;
    const lotCapturedAtResult = await pool.query(lotCapturedAtQuery, [lot_id]);
    const lotCapturedAt = lotCapturedAtResult.rows[0]?.captured_at ?? null;

    // 3. データベースから該当するショットの一覧を取得
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

    // 4. 仕様書通りのフォーマットでレスポンスを組み立てる
    const responseData = {
      lot_id: lot_id,
      // ロットの代表時刻（最初/最後のいずれか）
      captured_at: lotCapturedAt,
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