import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続設定をインポート

/**
 * 権限（ロール）一覧を取得するAPI (GET)
 */
export async function GET(request) {
  try {
    const query = `
      SELECT
        role_id,
        role_name,
        is_admin
      FROM roles
      ORDER BY role_id ASC;
    `;
    const result = await db.query(query);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('ロール取得時にDBエラーが発生しました:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 新しい権限（ロール）を登録するAPI (POST)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { role_name, is_admin } = body;

    // --- バリデーション ---
    // role_nameが空、またはis_adminが指定されていない場合はエラー
    if (!role_name || typeof is_admin !== 'boolean') {
      return NextResponse.json(
        { message: '必須項目（role_name, is_admin）が不足しているか、型が正しくありません' },
        { status: 400 } // Bad Request
      );
    }

    // --- DBへの登録処理 ---
    const query = `
      INSERT INTO roles (role_name, is_admin)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const values = [role_name, is_admin];

    const result = await db.query(query, values);
    const newRole = result.rows[0];

    // 成功レスポンスを返す
    return NextResponse.json(newRole, { status: 201 }); // Created

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ロール登録時にDBエラーが発生しました:', error);

    // role_nameの重複エラー（unique制約違反）の場合
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたrole_nameは既に使用されています' },
        { status: 409 } // Conflict
      );
    }

    // その他のサーバーエラー
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました' },
      { status: 500 }
    );
  }
}