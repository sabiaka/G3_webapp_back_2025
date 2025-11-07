import { NextResponse } from 'next/server';
import db from '@/lib/db'; // 従業員APIと同じdbインスタンスをインポート

/**
 * ヘルパー関数: 重要度を数値から文字列に変換
 * (設計書のレスポンス仕様「低い」「普通」「高い」に合わせるため)
 * @param {number | null | undefined} priority - 優先度 (1, 2, 3)
 * @returns {string} - 「低い」「普通」「高い」
 */
const convertPriorityToText = (priority) => {
  switch (priority) {
    case 1:
      return '低い';
    case 2:
      return '普通';
    case 3:
      return '高い';
    default:
      return '低い'; // DBがNULLや想定外の値だった場合のデフォルト
  }
};

/**
 * 1. お知らせ取得 (GET)
 * エンドポイント: GET /api/message
 */
export async function GET(request) {
  try {
    const query = 'SELECT content, priority, updated_at FROM today_message WHERE message_id = 1';
    const result = await db.query(query);

    let message;

    if (result.rows.length > 0) {
      // --- データが見つかった場合 ---
      const dbData = result.rows[0];
      message = {
        content: dbData.content,
        priority: convertPriorityToText(dbData.priority), // 数値を「低い」などに変換
        updated_at: dbData.updated_at,
      };
    } else {
      // --- データがまだ1件も登録されていない場合 ---
      // (設計書に基づき、API側でレコードがない場合は空データを返す)
      message = {
        content: '', // 初期コンテンツ
        priority: '低い', // デフォルトの優先度
        updated_at: new Date().toISOString(), // 現在時刻
      };
    }

    return NextResponse.json(message);

  } catch (error) {
    // 従業員APIの形式に合わせたエラーレスポンス
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 2. お知らせ更新 (PUT)
 * エンドポイント: PUT /api/message
 */
export async function PUT(request) {
  try {
    // リクエストボディからデータを取得
    // { "content": "...", "priority": 3 } の形式で来る想定
    const body = await request.json();
    const { content, priority } = body;

    // --- バリデーション (簡易) ---
    // (従業員APIのPOSTを参考に)
    if (typeof content === 'undefined' || typeof priority === 'undefined') {
      return NextResponse.json(
        { message: '必須項目(content, priority)が不足しています。' },
        { status: 400 } // 400 Bad Request
      );
    }
    // (設計書のリクエスト仕様: 1, 2, 3 の数値)
    if (![1, 2, 3].includes(priority)) {
      return NextResponse.json(
        { message: 'priority は 1, 2, 3 のいずれかである必要があります。' },
        { status: 400 }
      );
    }

    // --- UPSERT (アサート) クエリ ---
    // (設計書の「存在しない場合のみ作成」推奨に対応)
    // ID=1がなければINSERT、あればUPDATEする
    const upsertQuery = `
      INSERT INTO today_message (message_id, content, priority, updated_at)
      VALUES (1, $1, $2, NOW())
      ON CONFLICT (message_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        priority = EXCLUDED.priority,
        updated_at = NOW()
      RETURNING content, priority, updated_at;
    `;
    
    // クエリ実行 ($1 に content, $2 に priority を渡す)
    const values = [content, priority];
    const result = await db.query(upsertQuery, values);

    // 更新後のデータを取得
    const updatedData = result.rows[0];

    // レスポンスを作成 (priorityを文字列に変換)
    const response = {
      content: updatedData.content,
      priority: convertPriorityToText(updatedData.priority), // 数値を「高い」などに変換
      updated_at: updatedData.updated_at,
    };

    return NextResponse.json(response); // 成功時 (200 OK)

  } catch (error) {
    // 従業員APIの形式に合わせたエラーレスポンス
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}