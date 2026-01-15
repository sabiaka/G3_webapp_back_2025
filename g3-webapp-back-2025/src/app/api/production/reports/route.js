
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * ファイル概要
 * ==========
 * このファイルは 生産レポート一覧 を取得するAPIを提供します。
 * 指定した日付や製品名での絞り込みに対応し、従業員名をJOINして一覧形式で返却します。
 * 全てのSQLはパラメータ化し、部分一致には ILIKE を用いて大文字小文字を区別せずに検索します。
 */
/**
 * 生産レポート一覧を取得するAPI
 * @description GET /api/production/reports
 * @param request - date=YYYY-MM-DD や product_name=製品名 のクエリパラメータで絞り込み
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
 *
 * 引数（Query Params）
 * - date          : 文字列 'YYYY-MM-DD'。その日付のレポートに絞り込み。
 * - product_name  : 文字列。部分一致（ILIKE）で製品名に一致するレポートに絞り込み。
 *
 * 成功時の戻り値（200）
 * - id                : 数値。レポートID。
 * - date              : 文字列 'YYYY-MM-DD'。
 * - product_name      : 文字列。製品名。
 * - plan              : 数値。計画数量。
 * - actual            : 数値。実績数量。
 * - achievement_rate  : 数値。達成率（DB格納値）。
 * - defective         : 数値。不良数量。
 * - employee_name     : 文字列。担当従業員名（未割り当て時は『未割り当て』）。
 *
 * エラー
 * - 500 サーバーエラー：DBエラー等。
 *
 * 実装方針の要点
 * - 基本SELECTに対して WHERE句を動的組み立て。$1, $2... プレースホルダでインジェクション防止。
 * - 製品名は ILIKE により部分一致・ケース非依存。
 */
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