import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続設定をインポート

/**
 * 生産ラインの一覧を取得するAPI (GET)
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