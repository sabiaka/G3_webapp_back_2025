import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';

/**
 * 従業員データを取得するAPI (GET)
 * @description is_activeを除く全ての検索フィルターを部分一致に変更
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    // クエリパラメータとDBカラムのマッピング
    const paramToColumnMap = {
      'name_like': 'e.employee_name',
      'is_active': 'e.employee_is_active',
      'role_name': 'r.role_name',
      'line_name': 'pl.line_name',
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
        e.employee_id,
        e.employee_name,
        e.employee_user_id,
        e.employee_is_active,
        r.role_name,
        pl.line_name,
        e.employee_special_notes,
        e.employee_color_code
      FROM 
        employees e
      LEFT JOIN 
        roles r ON e.employee_role_id = r.role_id
      LEFT JOIN 
        production_lines pl ON e.employee_line_id = pl.line_id
    `;

    // WHERE句を動的に構築
    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(filters)) {
      if (column === 'e.employee_is_active') {
        // is_active はブーリアン型なので完全一致(=)で検索
        whereClauses.push(`${column} = $${paramIndex++}`);
        queryParams.push(value);
      } else {
        // それ以外の文字列カラムは部分一致(LIKE)で検索
        whereClauses.push(`${column} LIKE $${paramIndex++}`);
        queryParams.push(`%${value}%`);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (sort === 'id_asc') {
      query += ' ORDER BY e.employee_id ASC';
    } else if (sort === 'id_desc') {
      query += ' ORDER BY e.employee_id DESC';
    }

    const result = await db.query(query, queryParams);

    const formattedEmployees = result.rows.map(employee => ({
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_user_id: employee.employee_user_id,
      is_active: employee.employee_is_active,
      role_name: employee.role_name,
      line_name: employee.line_name,
      special_notes: employee.employee_special_notes,
      color_code: employee.employee_color_code
    }));

    return NextResponse.json({ employees: formattedEmployees });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}


/**
 * 新しい従業員を登録するAPI (POST)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    const { 
      employee_name, 
      employee_user_id, 
      password, 
      role_id,
      line_id,
      color_code, 
      special_notes 
    } = body;

    if (!employee_name || !employee_user_id || !password || role_id === undefined || line_id === undefined) {
      return NextResponse.json(
        { message: '必須項目が不足しています。' },
        { status: 400 }
      );
    }
    
    const hashedPassword = await bcrypt.hash(password, 10); 

    const query = `
      INSERT INTO employees (
        employee_name, 
        employee_user_id, 
        employee_password,
        employee_role_id, 
        employee_line_id, 
        employee_color_code, 
        employee_special_notes
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    
    const values = [
      employee_name, 
      employee_user_id, 
      hashedPassword,
      role_id,
      line_id,
      color_code, 
      special_notes
    ];
    
    const result = await db.query(query, values);
    const newEmployee = result.rows[0];

    const formattedResponse = {
      employee_id: newEmployee.employee_id,
      employee_name: newEmployee.employee_name,
      employee_user_id: newEmployee.employee_user_id,
      is_active: newEmployee.employee_is_active,
      role_id: newEmployee.employee_role_id,
      line_id: newEmployee.employee_line_id,
      special_notes: newEmployee.employee_special_notes,
      color_code: newEmployee.employee_color_code
    };

    return NextResponse.json(formattedResponse, { status: 201 });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたemployee_user_idは既に使用されています。' },
        { status: 409 }
      );
    }
    if (error.code === '23503') {
      return NextResponse.json(
        { message: '指定された役割(role)またはライン(line)が存在しません。' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}