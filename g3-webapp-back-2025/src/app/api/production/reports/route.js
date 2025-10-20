
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 生産レポート一覧を取得するAPI
 * @description GET /api/production/reports
 * @param request - date=YYYY-MM-DD や product_name=製品名 のクエリパラメータで絞り込み
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const productName = searchParams.get('product_name');

    // ベースとなるSQLクエリ
    let baseQuery = `
      SELECT
        pr.prodreport_id AS id,
        TO_CHAR(pr.prodreport_date, 'YYYY-MM-DD') AS date,
        pr.prodreport_product_name AS product_name,
        pr.prodreport_plan_quantity AS plan,
        pr.prodreport_actual_quantity AS actual,
        pr.prodreport_achievement_rate AS achievement_rate,
        pr.prodreport_defective_quantity AS defective,
        COALESCE(e.employee_name, '未割り当て') AS employee_name
      FROM
        production_reports AS pr
      LEFT JOIN
        employees AS e ON pr.prodreport_employee_id = e.employee_id
    `;

    // 絞り込み条件とパラメータを格納する配列
    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    // dateパラメータがあれば条件追加
    if (date) {
      whereClauses.push(`pr.prodreport_date = $${paramIndex++}`);
      queryParams.push(date);
    }

    // product_nameパラメータがあれば条件追加
    if (productName) {
      // 部分一致・大文字小文字を区別しないILIKEを使用
      whereClauses.push(`pr.prodreport_product_name ILIKE $${paramIndex++}`);
      queryParams.push(`%${productName}%`);
    }

    // 絞り込み条件があればWHERE句を組み立ててクエリに追加
    if (whereClauses.length > 0) {
      baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // 並び順を追加
    baseQuery += ` ORDER BY pr.prodreport_date DESC, pr.prodreport_id ASC`;

    // クエリを実行
    const result = await db.query(baseQuery, queryParams);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}