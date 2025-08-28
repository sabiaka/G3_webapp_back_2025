import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    const paramToColumnMap = {
      // 'employee_id': 'employee_id',
      'employee_name': 'employee_name',
      // 'employee_user_id': 'employee_user_id',
      'is_active': 'employee_is_active',
      // 'role_id': 'employee_role_id',
      'line_name': 'employee_line_name',
      // 'special_notes': 'employee_special_notes',
      // 'color_code': 'employee_color_code'
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

    return NextResponse.json({ employees: result.rows });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}