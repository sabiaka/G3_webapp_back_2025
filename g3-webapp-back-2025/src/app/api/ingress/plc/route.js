import { NextResponse } from 'next/server';
import db from '@/lib/db'; // 従業員APIのスタイルに合わせて、lib/db を使用

/**
 * 新しいマシンログを登録するAPI (POST)
 */
export async function POST(request) {
  try {
    // 1. リクエストボディをJSONとしてパース
    const body = await request.json();
    
    const { 
      timestamp,
      machine_name,
      log_type,
      title,
      message,
      unit_id // 任意 (NULL許容)
    } = body;

    // 2. 必須項目のバリデーション
    // (timestamp, machine_name, log_type, title はテーブル定義でNOT NULL)
    if (!timestamp || !machine_name || !log_type || !title) {
      return NextResponse.json(
        { message: '必須項目 (timestamp, machine_name, log_type, title) が不足しています。' },
        { status: 400 } // 400 Bad Request
      );
    }

    // 3. データベースへの挿入クエリ
    const query = `
      INSERT INTO machine_logs (
        machine_name, 
        unit_id, 
        timestamp, 
        log_type, 
        title, 
        message
      ) 
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *; -- 挿入した行を返す
    `;
    
    // 4. クエリに渡す値の配列
    const values = [
      machine_name,
      unit_id ?? null,     // 任意項目。未指定ならNULL
      timestamp,
      log_type,
      title,
      message ?? null      // 任意項目 (TEXT型, NULL許容)
    ];
    
    // 5. クエリの実行 (lib/db を使用)
    const result = await db.query(query, values);
    const newLog = result.rows[0];

    // 6. 成功レスポンス (作成されたログ情報をそのまま返す)
    return NextResponse.json(newLog, { status: 201 }); // 201 Created

  } catch (error) {
    // 7. エラーハンドリング
    console.error('DBエラー発生！:', error);

    // log_type のCHECK制約違反 (e.g., 'error', 'warning', 'info' 以外が渡された)
    if (error.code === '23514') {
      return NextResponse.json(
        { message: 'log_typeの値が不正です。(error, warning, info のいずれかである必要があります)' },
        { status: 400 }
      );
    }

    // JSONのパース失敗など
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    
    // その他のサーバーエラー
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}