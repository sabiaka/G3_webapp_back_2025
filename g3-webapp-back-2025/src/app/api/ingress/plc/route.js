import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * PLCからの情報を受け取り、ログと機械ステータスをDBに保存するAPI (POST)
 * トランザクションを利用して、ログ保存とステータス更新の原子性を保証します。
 */
export async function POST(request) {
  try {
    // 1. リクエストボディを取得
    const body = await request.json();
    const { 
      machine_name,
      timestamp, 
      log_type, 
      status, 
      title, 
      message 
    } = body;

    // 2. バリデーション: 必須項目が揃っているかチェック
    if (!machine_name || !log_type || !status || !title) {
      return NextResponse.json(
        { message: '必須項目（machine_name, log_type, status, title）が不足しています。' },
        { status: 400 } // Bad Request
      );
    }

    // --- トランザクション開始 ---
    await db.query('BEGIN');

    // 3. machine_logsテーブルにデータを挿入
    const logQuery = `
      INSERT INTO machine_logs (machine_name, timestamp, log_type, title, message) 
      VALUES ($1, $2, $3, $4, $5);
    `;
    const logValues = [machine_name, timestamp, log_type, title, message];
    await db.query(logQuery, logValues);

    // 4. machine_statusテーブルにデータを挿入または更新 (UPSERT)
    // machine_nameが存在すればUPDATE、存在しなければINSERTを実行
    const statusQuery = `
      INSERT INTO machine_status (machine_name, status, machine_data_time)
      VALUES ($1, $2, $3)
      ON CONFLICT (machine_name) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        machine_data_time = EXCLUDED.machine_data_time;
    `;
    const statusValues = [machine_name, status, timestamp]; // machine_data_timeにもリクエストのtimestampを使用
    await db.query(statusQuery, statusValues);
    
    // --- トランザクションをコミット（変更を確定） ---
    await db.query('COMMIT');

    // 5. 成功レスポンスを返す
    return NextResponse.json(
      { message: 'データを受け付けました。処理を開始します。' },
      { status: 202 } // Accepted
    );

  } catch (error) {
    // --- エラーが発生した場合はロールバック（変更を取り消し） ---
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('ロールバックに失敗しました:', rollbackError);
    }

    console.error('PLCデータ受付APIでDBエラーが発生しました:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 } // Internal Server Error
    );
  }
}