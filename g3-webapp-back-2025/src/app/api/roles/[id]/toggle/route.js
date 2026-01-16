/**
 * ファイル概要
 * ==========
 * このファイルは 特定IDのロールの is_admin をトグルするAPIを提供します。
 * boolean反転（NOT is_admin）で切替え、存在しないIDは404で返します。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 指定されたIDの権限（ロール）の is_admin をトグルするAPI (PATCH)
 * @param {Request} request - Next.jsのRequestオブジェクト (今回は使用しない)
 * @param {object} context - URLパラメータを含むオブジェクト
 * @param {object} context.params - URLパラメータ
 * @param {string} context.params.id - 更新対象のrole_id
 *
 * 成功時の戻り値（200）
 * - 更新後のロール1件。
 *
 * エラー
 * - 400 ID不正。
 * - 404 対象なし。
 * - 500 サーバーエラー。
 */
export async function PATCH(request, { params }) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);

    // --- バリデーション ---
    // URLのIDが数値でない場合
    if (isNaN(id)) {
      return NextResponse.json({ message: 'IDが不正です。' }, { status: 400 });
    }

    // --- DB更新処理 ---
    // "is_admin = NOT is_admin" でboolean値を反転させる
    const query = `
      UPDATE roles
      SET is_admin = NOT is_admin
      WHERE role_id = $1
      RETURNING *;
    `;
    const values = [id];
    
    const result = await db.query(query, values);

    // 更新対象が見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '指定されたIDのロールが見つかりません。' }, { status: 404 });
    }

    // 成功レスポンスを返す
    return NextResponse.json(result.rows[0]);

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ロールのトグル時にDBエラーが発生しました:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}