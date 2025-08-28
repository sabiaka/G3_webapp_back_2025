// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続用

export async function GET(request) {
  try {
    // --- 1. クエリパラメータを取得 ---
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    // --- 2. パラメータ名とDBカラム名の対応表を定義 ---
    const paramToColumnMap = {
//      'employee_id': 'employee_id',
      'employee_name': 'employee_name',
//      'employee_user_id': 'employee_user_id',
      'is_active': 'employee_is_active',
//      'role_id': 'employee_role_id',
      'line_id': 'employee_line_id',
//      'special_notes': 'employee_special_notes',
//      'color_code': 'employee_color_code'
    };

    const filters = {};
    // 対応表をループして、リクエストされたパラメータの値を取得
    for (const [param, column] of Object.entries(paramToColumnMap)) {
      if (searchParams.has(param)) {
        const value = searchParams.get(param);
        if (value !== null && value !== '') {
          filters[column] = value; // { employee_id: '1' } のような形式で格納
        }
      }
    }

    // --- 3. SQLクエリを動的に組み立てる ---
    // ▼▼▼【修正点】▼▼▼
    // 取得するカラムを明示的に指定し、employee_password を除外します。
    let query = `
      SELECT
        employee_id,
        employee_name,
        employee_user_id,
        employee_is_active,
        employee_role_id,
        employee_line_id,
        employee_special_notes,
        employee_color_code
      FROM employees
    `;
    // ▲▲▲【修正点】▲▲▲

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filters)) {
      // "name" や "notes" は部分一致検索（LIKE）
      if (key === 'employee_name' || key === 'employee_special_notes') {
        whereClauses.push(`${key} LIKE $${paramIndex++}`);
        queryParams.push(`%${value}%`);
      } else {
        // それ以外は完全一致検索
        whereClauses.push(`${key} = $${paramIndex++}`);
        queryParams.push(value);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // --- 4. ソート条件を追加 ---
    if (sort === 'id_asc') {
      query += ' ORDER BY employee_id ASC';
    } else if (sort === 'id_desc') {
      query += ' ORDER BY employee_id DESC';
    }

    // --- 5. データベースに問い合わせを実行 ---
    const result = await db.query(query, queryParams);

    return NextResponse.json({ employees: result.rows });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}