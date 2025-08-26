// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続用

export async function GET(request) {
  try {
    // --- 1. クエリパラメータを取得 ---
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    // --- 2. フィルタリング条件を定義 ---
    const filters = {
      employee_id: searchParams.get('employee_id'),
      employee_name: searchParams.get('employee_name'),
      employee_user_id: searchParams.get('employee_user_id'),
      // employee_password はセキュリティ上、検索条件に含めません！
      employee_is_active: searchParams.get('employee_is_active'),
      employee_role_id: searchParams.get('employee_role_id'),
      employee_line_id: searchParams.get('employee_line_id'),
      employee_special_notes: searchParams.get('employee_special_notes'),
      employee_color_code: searchParams.get('employee_color_code'),
    };

    // --- 3. SQLクエリを動的に組み立てる ---
    let query = 'SELECT * FROM employees'; // 基本のクエリ
    const whereClauses = []; // WHERE句の条件を入れる配列
    const queryParams = [];   // SQLインジェクション対策で、値はこちらに入れる
    let paramIndex = 1;

    // 各フィルター条件をチェックし、指定されていればWHERE句とパラメータを追加
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined && value !== '') { // パラメータに値がセットされている場合のみ
        
        // "name" や "notes" のような文字列は部分一致検索（LIKE）にすると便利
        if (key === 'employee_name' || key === 'employee_special_notes') {
          whereClauses.push(`${key} LIKE $${paramIndex++}`);
          queryParams.push(`%${value}%`); // 値を%で囲む
        } else {
          // それ以外の項目は完全一致（=）で検索
          whereClauses.push(`${key} = $${paramIndex++}`);
          queryParams.push(value);
        }
      }
    }

    // 絞り込み条件が1つ以上あれば、WHERE句をクエリに追加
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // --- 4. ソート条件を追加（前回の機能） ---
    // ※ employeesテーブルに 'price' カラムがない場合は、'employee_id' など存在するカラム名に変更してください。
    if (sort === 'id_asc') {
      query += ' ORDER BY employee_id ASC';
    } else if (sort === 'id_desc') {
      query += ' ORDER BY employee_id DESC';
    }

    // --- 5. データベースに問い合わせを実行 ---
    // 第2引数に値の配列を渡すことで、安全にクエリを実行できる
    const result = await db.query(query, queryParams);
    
    // 前回のご指摘に基づき、キー名を 'employees' に修正
    return NextResponse.json({ employees: result.rows });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    // エラーメッセージをより一般的なものに修正
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}