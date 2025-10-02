import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 検査結果のログを一覧で取得するAPI (GET)
 * @description フィルターとページネーションに対応しています。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type');
    const date = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    if (date) {
      whereClauses.push(`DATE(inspection_inspected_time) = $${paramIndex++}`);
      queryParams.push(date);
    }

    if (type) {
      whereClauses.push(`inspection_camera_id LIKE $${paramIndex++}`);
      queryParams.push(`${type}%`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM inspection_results ${whereString};`;
    const countResult = await db.query(countQuery, queryParams);
    const total_count = parseInt(countResult.rows[0].count, 10);
    const total_pages = Math.ceil(total_count / limit);

    const logParams = [...queryParams, limit, offset];
    const logsQuery = `
      SELECT
        inspection_id,
        inspection_camera_id AS camera_id, -- ▼ 追加 ▼
        inspection_captured_time AS captured_at,
        inspection_inspected_time AS inspected_at,
        inspection_product_id AS product_id,
        inspection_result AS status,
        inspection_reason AS details,
        inspection_image_path AS image_path
      FROM
        inspection_results
      ${whereString}
      ORDER BY
        inspection_id DESC
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