// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続用

// requestの他に、paramsを受け取る
export async function GET(request, { params }) {
  try {
    // URLからIDを取得 (例: /api/employees/1 の場合は id = "1")
    const { id } = params;

    // パラメータ化クエリでSQLインジェクションを防ぐ
    const query = 'SELECT * FROM employees WHERE employee_id = $1';
    const result = await db.query(query, [id]);

    // IDに該当する従業員が見つからない場合
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 } // 404 Not Foundを返す
      );
    }

    // 取得した1件のデータを整形
    const employee = result.rows[0];
    const formattedEmployee = {
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_user_id: employee.employee_user_id,
      is_active: employee.employee_is_active,
      role_name: employee.employee_role_name,
      line_name: employee.employee_line_name,
      special_notes: employee.employee_special_notes,
      color_code: employee.employee_color_code,
    };

    // 成功した場合は、整形済み従業員データ（1件）を返す
    return NextResponse.json(formattedEmployee);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバー側でエラーが発生しました' },
      { status: 500 }
    );
  }
}
// 色コードを6桁に正規化（例: '#a3e6c8' -> 'A3E6C8'）
function normalizeColorCode(code) {
  if (code == null) return null;
  const c = code.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(c)) {
    throw new Error('color_code は 6桁の16進数で指定してください');
  }
  return c.toUpperCase();
}

// API返却用の整形
function toFormattedEmployee(row) {
  return {
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_user_id: row.employee_user_id,
    is_active: row.employee_is_active,
    role_name: row.employee_role_name,
    line_name: row.employee_line_name,
    special_notes: row.employee_special_notes,
    color_code: row.employee_color_code,
  };
}

// role_id / line_id を name に解決
async function resolveNamesByIds({ role_id, line_id }) {
  let role_name = null;
  let line_name = null;

  if (role_id != null) {
    const r = await db.query('SELECT role_name FROM roles WHERE role_id = $1', [role_id]);
    if (r.rows.length === 0) throw new Error('指定された role_id は存在しません');
    role_name = r.rows[0].role_name;
  }
  if (line_id != null) {
    const r = await db.query('SELECT line_name FROM production_lines WHERE line_id = $1', [line_id]);
    if (r.rows.length === 0) throw new Error('指定された line_id は存在しません');
    line_name = r.rows[0].line_name;
  }
  return { role_name, line_name };
}

// PUT: 従業員を更新
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    const {
      employee_name,
      employee_user_id,
      password, // string のときだけ更新
      role_id,
      line_id,
      is_active,
      color_code,
      special_notes,
    } = body || {};

    // 存在確認
    const exists = await db.query('SELECT 1 FROM employees WHERE employee_id = $1', [id]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // id → name 解決
    const { role_name, line_name } = await resolveNamesByIds({ role_id, line_id });

    // color 正規化
    const normalizedColor = color_code != null ? normalizeColorCode(color_code) : null;

    // 動的に SET 句を構築
    const sets = [];
    const vals = [];
    let i = 1;

    if (employee_name !== undefined) { sets.push(`employee_name = $${i++}`); vals.push(employee_name); }
    if (employee_user_id !== undefined) { sets.push(`employee_user_id = $${i++}`); vals.push(employee_user_id); }
    if (typeof is_active === 'boolean') { sets.push(`employee_is_active = $${i++}`); vals.push(is_active); }
    if (role_name !== null) { sets.push(`employee_role_name = $${i++}`); vals.push(role_name); }
    if (line_name !== null) { sets.push(`employee_line_name = $${i++}`); vals.push(line_name); }
    if (special_notes !== undefined) { sets.push(`employee_special_notes = $${i++}`); vals.push(special_notes); }
    if (normalizedColor !== null) { sets.push(`employee_color_code = $${i++}`); vals.push(normalizedColor); }

    // password が string のときだけ更新
    if (typeof password === 'string') {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`employee_password = $${i++}`);
      vals.push(hash);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: '更新対象のフィールドがありません' }, { status: 400 });
    }

    vals.push(id);
    const sql = `
      UPDATE employees
         SET ${sets.join(', ')}
       WHERE employee_id = $${i}
       RETURNING *;
    `;
    const result = await db.query(sql, vals);

    return NextResponse.json(toFormattedEmployee(result.rows[0]));
  } catch (error) {
    console.error('PUTエラー:', error);
    const msg = error && error.message ? error.message : 'サーバー側でエラーが発生しました';
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
// 既存:
// import { NextResponse } from 'next/server';
// import db from '@/lib/db';

export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    // 該当従業員を論理削除（is_active=false）
    const result = await db.query(
      `UPDATE employees
          SET employee_is_active = false
        WHERE employee_id = $1
        RETURNING employee_is_active;`,
      [id]
    );

    // レコードがなければ 404
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // すでに false でも成功扱いで 204
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('DELETE(論理削除)エラー:', error);
    return NextResponse.json(
      { message: 'サーバー側でエラーが発生しました' },
      { status: 500 }
    );
  }
}
