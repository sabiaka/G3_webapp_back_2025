// --- 必要なインポート ---
import { NextResponse } from 'next/server'; // これが必須だよ！
import db from '@/lib/db'; // DB接続用

// requestの他に、paramsを受け取る
export async function GET(request, { params }) {
  try {
    // URLからIDを取得 (例: /api/employees/1 の場合は id = "1")
    const { id } = await params;

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
