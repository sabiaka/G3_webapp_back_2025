import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 検査結果のログを一覧で取得するAPI (GET)
 * @description フィルターとページネーションに対応しています。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // --- クエリパラメータ取得 ---
    const typeAlias = searchParams.get('type');
    const date = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // --- フィルタリングとページネーションの準備 ---
    const typeToCameraNameMap = {
      'spring': 'バネ止めカメラ',
      'alayer': 'A層カメラ',
    };
    const cameraNameToFilterBy = typeToCameraNameMap[typeAlias];
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    if (date) {
      whereClauses.push(`DATE(inspection_inspected_time) = $${paramIndex++}`);
      queryParams.push(date);
    }
    if (cameraNameToFilterBy) {
      whereClauses.push(`inspection_camera_id = $${paramIndex++}`);
      queryParams.push(cameraNameToFilterBy);
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. フィルター条件に一致する全件数を取得
    const countQuery = `SELECT COUNT(*) FROM inspection_results ${whereString};`;
    const countResult = await db.query(countQuery, queryParams);
    const total_count = parseInt(countResult.rows[0].count, 10);
    const total_pages = Math.ceil(total_count / limit);

    // 2. 指定されたページのログデータを取得
    const logParams = [...queryParams, limit, offset];
    const logsQuery = `
      SELECT
        inspection_id,
        inspection_captured_time AS captured_at,
        inspection_inspected_time AS inspected_at,
        inspection_product_id AS product_id,
        inspection_result AS status,
        inspection_reason AS details,
        inspection_image_path AS image_path
      FROM
        inspection_results
      ${whereString}
      -- ▼ 修正点 ▼
      ORDER BY
        inspection_id DESC -- 並び替えの基準を検査日時からIDに変更
      -- ▲ 修正点 ▲
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++};
    `;
    const logsResult = await db.query(logsQuery, logParams);

    const response = {
      total_pages: total_pages,
      current_page: page,
      logs: logsResult.rows,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}