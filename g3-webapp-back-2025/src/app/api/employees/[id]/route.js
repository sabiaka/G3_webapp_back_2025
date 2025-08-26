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

    // 成功した場合は、従業員データ（1件）を返す
    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバー側でエラーが発生しました' },
      { status: 500 }
    );
  }
}