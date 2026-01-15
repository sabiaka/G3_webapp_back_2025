import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { emitEvent } from '@/lib/event-bus'; // ★変更: 既存のEvent Busを使用

/**
 * PLCログ情報送信API (POST)
 * 設計書セクション: 3
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    const { 
      timestamp,
      machine_name,
      log_type,
      title,
      message,
      unit_id 
    } = body;

    // バリデーション
    if (!timestamp || !machine_name || !log_type || !title) {
      return NextResponse.json(
        { message: '必須項目 (timestamp, machine_name, log_type, title) が不足しています。' },
        { status: 400 }
      );
    }

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
      RETURNING *;
    `;
    
    const values = [
      machine_name,
      unit_id ?? null,
      timestamp,
      log_type,
      title,
      message ?? null
    ];
    
    // DBへの保存実行
    await db.query(query, values);

    // ★追加: Event Bus経由で通知
    // これにより、別途用意するSSEエンドポイントがイベントを拾ってクライアントへ通知します
    emitEvent({
      ivent: "plc:logReceived",
      message: "PLCログが受信されました"
    });

    // ★変更: レスポンスを 202 Accepted に変更
    return NextResponse.json(
      { message: "データを受け付けました。処理を開始します。" }, 
      { status: 202 }
    );

  } catch (error) {
    console.error('DBエラー発生！:', error);

    if (error.code === '23514') {
      return NextResponse.json(
        { message: 'log_typeの値が不正です。(error, warning, info のいずれかである必要があります)' },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}