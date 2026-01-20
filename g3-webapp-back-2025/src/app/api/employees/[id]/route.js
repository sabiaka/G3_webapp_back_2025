/**
 * ファイルの役割:
 *   従業員1件の参照・更新・削除を提供するAPIルート。
 *   Next.js App Router 配下のエンドポイントとして、GET/PUT/DELETE を実装。
 *   DBアクセスは pg のプール経由で生SQL(プレースホルダ)を使用する。
 *
 * 実装ポリシー:
 *   - 見つからない場合は404を返す(仕様の明確化)。
 *   - 更新は差分のみをSQLでセットし、空更新は400で返す。
 *   - 削除は仕様通り物理削除で204 No Contentを返す。
 */
// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';

/**
 * 従業員データを1件取得するAPI (GET by ID)
 *
 * 説明:
 *   `employee_id` に一致する従業員を取得し、役割名・ライン名を結合して返す。
 *
 * I/O:
 *   @param {Request} request                                 - Next.jsのRequestオブジェクト
 *   @param {{ params: { id: string } }} context              - ルートパラメータコンテキスト
 *   @returns {NextResponse}                                   - JSON: EmployeeSummary | 404
 *
 * ステータス:
 *   200                                                       - 正常終了
 *   404                                                       - 該当レコードなし
 *   500                                                       - サーバ内部エラー
 */
export async function GET(request, { params }) {
  try {
    // ======== ルートパラメータの取得 ========
    const { id } = await params;
    const query = `
      SELECT
        e.employee_id,
        e.employee_name,
        e.employee_user_id,
        e.employee_is_active,
        r.role_name,
        pl.line_name,
        e.employee_special_notes,
        e.employee_color_code
      FROM employees e
      LEFT JOIN roles r ON e.employee_role_id = r.role_id
      LEFT JOIN production_lines pl ON e.employee_line_id = pl.line_id
      WHERE e.employee_id = $1;
    `;
    // なぜ: パラメータバインドでSQLインジェクションを回避
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // レスポンスのキー名を整形
    // なぜ: クライアントの期待する命名規則に合わせるため
    const employee = result.rows[0];
    const formattedEmployee = {
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        employee_user_id: employee.employee_user_id,
        is_active: employee.employee_is_active,
        role_name: employee.role_name,
        line_name: employee.line_name,
        special_notes: employee.employee_special_notes,
        color_code: employee.employee_color_code
    };

    return NextResponse.json(formattedEmployee);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json({ message: 'サーバー側でエラーが発生しました' }, { status: 500 });
  }
}


/**
 * 従業員データを更新するAPI (PUT)
 *
 * 説明:
 *   差分更新API。指定フィールドのみSETし、空更新は400を返す。
 *   パスワードは文字列かつ長さ>0のときのみbcryptで再ハッシュ化して更新する。
 *
 * I/O:
 *   @param {Request} request                                 - Next.jsのRequestオブジェクト
 *   @param {{ params: { id: string } }} context              - ルートパラメータコンテキスト
 *   @returns {NextResponse}                                   - JSON: 更新後の従業員整形データ
 *
 * 受信ボディ(JSON):
 *   employee_name                                            - 従業員名(任意)
 *   employee_user_id                                         - ユーザーID(任意, 一意制約あり)
 *   password                                                 - 新パスワード(任意, 指定時のみハッシュ更新)
 *   role_id                                                  - 役割ID(任意, 外部キー)
 *   line_id                                                  - ラインID(任意, 外部キー)
 *   is_active                                                - 有効/無効(任意, boolean)
 *   color_code                                               - カラーコード(任意)
 *   special_notes                                            - 特記事項(任意)
 *
 * ステータス:
 *   200                                                       - 更新成功
 *   400                                                       - 更新対象なし(空更新)
 *   404                                                       - 対象IDなし
 *   409                                                       - 一意制約違反
 *   400                                                       - 外部キー不正
 *   500                                                       - サーバ内部エラー
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    // ======== 入力取得 ========
    const body = await request.json();

    const {
      employee_name,
      employee_user_id,
      password,
      role_id,
      line_id,
      is_active,
      color_code,
      special_notes,
    } = body || {};

    // ======== 存在チェック: 更新対象がない場合は404 ========
    const exists = await db.query('SELECT 1 FROM employees WHERE employee_id = $1', [id]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // ======== 差分SET句の構築: 渡された項目のみ更新 ========
    const sets = [];
    const vals = [];
    let i = 1;

    if (employee_name !== undefined) { sets.push(`employee_name = $${i++}`); vals.push(employee_name); }
    if (employee_user_id !== undefined) { sets.push(`employee_user_id = $${i++}`); vals.push(employee_user_id); }
    if (typeof is_active === 'boolean') { sets.push(`employee_is_active = $${i++}`); vals.push(is_active); }
    if (special_notes !== undefined) { sets.push(`employee_special_notes = $${i++}`); vals.push(special_notes); }
    if (color_code !== undefined) { sets.push(`employee_color_code = $${i++}`); vals.push(color_code); }
    if (role_id !== undefined) { sets.push(`employee_role_id = $${i++}`); vals.push(role_id); }
    if (line_id !== undefined) { sets.push(`employee_line_id = $${i++}`); vals.push(line_id); }
    
    if (typeof password === 'string' && password.length > 0) {
      // なぜ: パスワードは常にハッシュ化して保存する(安全性確保)
      const hashedPassword = await bcrypt.hash(password, 10);
      sets.push(`employee_password = $${i++}`);
      vals.push(hashedPassword);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: '更新対象のフィールドがありません' }, { status: 400 });
    }

    // ======== 実行 ========
    vals.push(id);
    const sql = `UPDATE employees SET ${sets.join(', ')} WHERE employee_id = $${i} RETURNING *;`;
    const result = await db.query(sql, vals);
    const updatedEmployee = result.rows[0];

    // ======== 整形 ========
    const formattedResponse = {
        employee_id: updatedEmployee.employee_id,
        employee_name: updatedEmployee.employee_name,
        employee_user_id: updatedEmployee.employee_user_id,
        is_active: updatedEmployee.employee_is_active,
        role_id: updatedEmployee.employee_role_id,
        line_id: updatedEmployee.employee_line_id,
        special_notes: updatedEmployee.employee_special_notes,
        color_code: updatedEmployee.employee_color_code
    };

    return NextResponse.json(formattedResponse, { status: 200 });

  } catch (error) {
    console.error('PUT API Error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ message: 'そのユーザーIDは既に使用されています' }, { status: 409 });
    }
    if (error.code === '23503') {
        return NextResponse.json({ message: '指定された役割(role)またはライン(line)が存在しません。' }, { status: 400 });
    }
    return NextResponse.json({ message: 'サーバー内部でエラーが発生しました。' }, { status: 500 });
  }
}


/**
 * 従業員を物理削除するAPI (DELETE)
 * @description 仕様書通り、レコードをDBから完全に削除する
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    // --- 変更点: UPDATE文をDELETE文に変更 ---
    const result = await db.query(
      `DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id;`,
      [id]
    );

    // 削除対象のレコードが見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // 成功時は仕様書通り204 No Contentを返す
    return new Response(null, { status: 204 });

  } catch (error) {
    console.error('DELETE API Error:', error);
    return NextResponse.json({ message: 'サーバー内部でエラーが発生しました。' }, { status: 500 });
  }
}