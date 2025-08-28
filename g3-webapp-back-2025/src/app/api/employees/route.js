import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    // ... (paramToColumnMapとfiltersの部分は変更なし) ...
    const paramToColumnMap = {
      'employee_name': 'employee_name',
      'is_active': 'employee_is_active',
      'line_name': 'employee_line_name',
    };

    const filters = {};
    for (const [param, column] of Object.entries(paramToColumnMap)) {
      if (searchParams.has(param)) {
        const value = searchParams.get(param);
        if (value !== null && value !== '') {
          filters[column] = value;
        }
      }
    }

    // ★★★ここまでのSQLを組み立てるロジックは一切変更しません★★★
    let query = `
      SELECT
        employee_id,
        employee_name,
        employee_user_id,
        employee_is_active,
        employee_role_name,
        employee_line_name,
        employee_special_notes,
        employee_color_code
      FROM employees
    `;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (key === 'employee_name' || key === 'employee_special_notes') {
        whereClauses.push(`${key} LIKE $${paramIndex++}`);
        queryParams.push(`%${value}%`);
      } else {
        whereClauses.push(`${key} = $${paramIndex++}`);
        queryParams.push(value);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (sort === 'id_asc') {
      query += ' ORDER BY employee_id ASC';
    } else if (sort === 'id_desc') {
      query += ' ORDER BY employee_id DESC';
    }

    const result = await db.query(query, queryParams);
    
    // ▼▼▼ ここからが追加したコードです ▼▼▼
    // result.rowsの各オブジェクトのキー名を変更する
    const formattedEmployees = result.rows.map(employee => ({
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_user_id: employee.employee_user_id,
      is_active: employee.employee_is_active,           // ここでキー名を変更
      role_name: employee.employee_role_name,         // ここでキー名を変更
      line_name: employee.employee_line_name,         // ここでキー名を変更
      special_notes: employee.employee_special_notes,   // ここでキー名を変更
      color_code: employee.employee_color_code        // ここでキー名を変更
    }));
    // ▲▲▲ ここまでが追加したコードです ▲▲▲

    // 返すデータを、キー名を変更したformattedEmployeesに変更する
    return NextResponse.json({ employees: formattedEmployees });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}