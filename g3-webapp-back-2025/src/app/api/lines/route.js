/**
 * ファイルの役割:
 *   生産ラインの一覧取得と新規登録を提供するAPIルート。
 *   一覧はID昇順、登録はline_nameの一意制約に従う。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続設定をインポート

/**
 * 生産ラインの一覧を取得するAPI (GET)
 *
 * 説明:
 *   production_lines から line_id, line_name を取得し、ID昇順で返却する。
 *
 * I/O:
 *   @param {Request} request                                   - リクエスト
 *   @returns {NextResponse}                                     - JSON: Array<{ line_id, line_name }>
 *
 * ステータス:
 *   200                                                         - 成功
 *   500                                                         - サーバ内部エラー
 */
export async function GET(request) {
  try {
    const query = `
      SELECT
        line_id,
        line_name
      FROM production_lines
      ORDER BY line_id ASC;
    `;
    const result = await db.query(query);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('ライン一覧の取得時にDBエラーが発生しました:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 新しい生産ラインを登録するAPI (POST)
 *
 * 説明:
 *   line_name を受け取り、production_lines に挿入する。
 *   一意制約違反時は409を返す。
 *
 * I/O:
 *   @param {Request} request                                   - JSONボディを含むリクエスト
 *   @returns {NextResponse}                                     - JSON: 登録されたライン
 *
 * 受信ボディ(JSON):
 *   line_name                                                   - ライン名(必須)
 *
 * ステータス:
 *   201                                                         - 作成成功
 *   400                                                         - 入力エラー
 *   409                                                         - 一意制約違反
 *   500                                                         - サーバ内部エラー
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { line_name } = body;

    // --- バリデーション ---
    if (!line_name) {
      return NextResponse.json(
        { message: '必須項目（line_name）が不足しています。' },
        { status: 400 } // Bad Request
      );
    }

    // --- DBへの登録処理 ---
    const query = `
      INSERT INTO production_lines (line_name)
      VALUES ($1)
      RETURNING *;
    `;
    const values = [line_name];

    const result = await db.query(query, values);
    const newLine = result.rows[0];

    // 成功レスポンスを返す
    return NextResponse.json(newLine, { status: 201 }); // Created

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ライン登録時にDBエラーが発生しました:', error);

    // line_nameの重複エラー（unique制約違反）の場合
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたline_nameは既に使用されています。' },
        { status: 409 } // Conflict
      );
    }

    // その他のサーバーエラー
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}