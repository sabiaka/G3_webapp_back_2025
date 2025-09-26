import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 指定されたIDの権限（ロール）を更新するAPI (PUT)
 * @param {Request} request - Next.jsのRequestオブジェクト
 * @param {object} context - URLパラメータを含むオブジェクト
 * @param {object} context.params - URLパラメータ
 * @param {string} context.params.id - 更新対象のrole_id
 */
export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    const { role_name, is_admin } = body;

    // --- バリデーション ---
    if (isNaN(id)) {
      return NextResponse.json({ message: 'IDが不正です。' }, { status: 400 });
    }
    if (role_name === undefined && is_admin === undefined) {
      return NextResponse.json({ message: '更新するデータがありません。' }, { status: 400 });
    }
    if (is_admin !== undefined && typeof is_admin !== 'boolean') {
      return NextResponse.json({ message: 'is_adminはboolean型である必要があります。' }, { status: 400 });
    }
    
    // --- 動的なUPDATEクエリの構築 ---
    const setClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    if (role_name !== undefined) {
      setClauses.push(`role_name = $${paramIndex++}`);
      queryParams.push(role_name);
    }
    if (is_admin !== undefined) {
      setClauses.push(`is_admin = $${paramIndex++}`);
      queryParams.push(is_admin);
    }
    queryParams.push(id);

    const query = `
      UPDATE roles
      SET ${setClauses.join(', ')}
      WHERE role_id = $${paramIndex}
      RETURNING *;
    `;

    // --- DB更新処理 ---
    const result = await db.query(query, queryParams);
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '指定されたIDのロールが見つかりません。' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ロール更新時にDBエラーが発生しました:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたrole_nameは既に使用されています。' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 指定されたIDの権限（ロール）を削除するAPI (DELETE)
 * @param {Request} request - Next.jsのRequestオブジェクト (今回は使用しない)
 * @param {object} context - URLパラメータを含むオブジェクト
 * @param {object} context.params - URLパラメータ
 * @param {string} context.params.id - 削除対象のrole_id
 */
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id, 10);

    // --- バリデーション ---
    if (isNaN(id)) {
      return NextResponse.json({ message: 'IDが不正です。' }, { status: 400 });
    }

    // --- DB削除処理 ---
    const query = 'DELETE FROM roles WHERE role_id = $1';
    const values = [id];
    
    const result = await db.query(query, values);

    // 削除対象が見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '指定されたIDのロールが見つかりません。' }, { status: 404 });
    }

    // 成功レスポンス (No Content)
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ロール削除時にDBエラーが発生しました:', error);

    // 外部キー制約違反の場合
    if (error.code === '23503') {
      return NextResponse.json(
        { message: 'このロールは従業員に割り当てられているため削除できません。' },
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