import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    const paramToColumnMap = {
      'name_like': 'employee_name',
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
    const formattedEmployees = result.rows.map(employee => ({
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_user_id: employee.employee_user_id,
      is_active: employee.employee_is_active,
      role_name: employee.employee_role_name,
      line_name: employee.employee_line_name,
      special_notes: employee.employee_special_notes,
      color_code: employee.employee_color_code
    }));
    
    /*
     * ===============================================================
     * JSONデータの送信 (レスポンス)
     * ===============================================================
     * NextResponse.json() は、APIの処理結果をクライアントに返すための重要な関数です。
     * ここでは、データベースから取得した従業員リスト (formattedEmployees) を
     * JSON形式のデータに変換して、HTTPレスポンスのボディに設定しています。
     * クライアント側（フロントエンドなど）は、このJSONデータを受け取って画面に表示するなどの処理を行います。
     * * 内部的な動作:
     * 1. JavaScriptのオブジェクトや配列 ({ employees: formattedEmployees }) を受け取る。
     * 2. これをJSON文字列にシリアライズ（変換）する。
     * 3. HTTPレスポンスのヘッダーに自動的に 'Content-Type: application/json' を設定する。
     * 4. このレスポンスをクライアントに送信する。
     * ===============================================================
     */
    return NextResponse.json({ employees: formattedEmployees });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}










// POST関数を新しいDBに合わせて修正
export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      employee_name, 
      employee_user_id, 
      password, 
      // ★変更点1: IDではなく名前を受け取るように変更
      role_name:employee_role_name, 
      line_name:employee_line_name, 
      color_code, 
      special_notes 
    } = body;

    // ★変更点2: role_nameとline_nameも必須項目としてチェック
    if (!employee_name || !employee_user_id || !password || !employee_role_name || !employee_line_name) {
      return NextResponse.json(
        { message: '必須項目が不足しています。' },
        { status: 400 }
      );
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);

    // ★変更点3: INSERTする列名とVALUESの変数を変更
    const query = `
      INSERT INTO employees (
        employee_name, 
        employee_user_id, 
        employee_password, -- DBの列名に合わせる（もしemployee_password_hashなら要修正）
        employee_role_name, 
        employee_line_name, 
        employee_color_code, 
        employee_special_notes
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        employee_id,
        employee_name,
        employee_user_id,
        employee_is_active,
        employee_role_name, -- ★変更点4: そのまま列を返す
        employee_line_name, -- ★変更点4: そのまま列を返す
        employee_special_notes,
        employee_color_code;
    `;
    
    // ★変更点5: クエリに渡す値の配列を変更
    const values = [
      employee_name, 
      employee_user_id, 
      hashedPassword, 
      employee_role_name, 
      employee_line_name, 
      color_code, 
      special_notes
    ];
    
    const result = await db.query(query, values);
    const newEmployee = result.rows[0];

    // 返却するデータはキー名を調整する（任意）
    const formattedEmployee = {
      employee_id: newEmployee.employee_id,
      employee_name: newEmployee.employee_name,
      employee_user_id: newEmployee.employee_user_id,
      is_active: newEmployee.employee_is_active,
      role_name: newEmployee.employee_role_name, // APIの返却値としてキー名をrole_nameに
      line_name: newEmployee.employee_line_name, // APIの返却値としてキー名をline_nameに
      special_notes: newEmployee.employee_special_notes,
      color_code: newEmployee.employee_color_code,
    };

    return NextResponse.json(formattedEmployee, { status: 201 });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    if (error.code === '23505') {
       return NextResponse.json(
         { message: '指定されたemployee_user_idは既に使用されています。' },
         { status: 409 }
       );
    }
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}
