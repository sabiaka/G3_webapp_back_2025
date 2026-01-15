/**
 * ファイル概要
 * ==========
 * このファイルは「今日のお知らせ（today_message）」を取得・更新するAPIを提供します。
 * レコードは message_id=1 の単一行を前提とし、存在しない場合はPUT時にUPSERTで作成します。
 * 優先度はDB上の数値(1/2/3)をレスポンスでは「低い/普通/高い」に変換して返却します。
 */
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
 * GET /api/message
 * --------------------------------------
 * 今日のお知らせを取得します。存在しない場合は空の初期データを返します。
 *
 * 引数（Query Params）
 * - なし
 *
 * 成功時の戻り値（200）
 * - content     : 文字列。お知らせ本文。
 * - priority    : 文字列。「低い」「普通」「高い」のいずれか。
 * - updated_at  : 文字列。更新日時（ISO形式）。
 *
 * エラー
 * - 500 サーバーエラー : DBアクセス等で異常が発生した場合。
 *
 * 実装方針の要点
 * - today_message テーブルの message_id=1 を取得。存在しない場合はフロント仕様に合わせ初期値で返却。
 * - 優先度はヘルパーで数値→テキスト化し、UI仕様に揃える。
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
 * PUT /api/message
 * --------------------------------------
 * 今日のお知らせを更新します。レコードが無い場合はUPSERTで新規作成します。
 *
 * リクエストボディ（JSON）
 * - content   : 文字列。お知らせ本文（必須）。
 * - priority  : 数値。1|2|3 のいずれか（必須）。
 *
 * 成功時の戻り値（200）
 * - content     : 文字列。更新後のお知らせ本文。
 * - priority    : 文字列。「低い」「普通」「高い」。
 * - updated_at  : 文字列。更新日時（ISO形式）。
 *
 * エラー
 * - 400 入力不足/不正 : content/priority が不足、または priority が 1|2|3 以外。
 * - 500 サーバーエラー : DBアクセス等で異常が発生した場合。
 *
 * 実装方針の要点
 * - ON CONFLICT (message_id) DO UPDATE を用いて単一レコードを維持しつつ更新。
 * - updated_at はDB側で NOW() により更新。
 * - レスポンスでは優先度をテキスト化して返し、フロント仕様と整合。
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