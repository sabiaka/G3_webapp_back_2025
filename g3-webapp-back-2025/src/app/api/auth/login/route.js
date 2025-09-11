import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/*
 * POST /api/auth/login
 * 要件: registerと同様にPrisma風ではなく生SQL + db.query を使用
 * 手順:
 *  1. 入力バリデーション
 *  2. ユーザー取得 (employee_user_id)
 *  3. activeチェック
 *  4. パスワード検証（bcrypt / 平文フォールバック）
 *  5. JWT発行
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { employee_user_id, password } = body || {};

    if (!employee_user_id || !password) {
      return NextResponse.json(
        { error: 'employee_user_id と password は必須です。' },
        { status: 400 }
      );
    }

    const selectSql = `
      SELECT employee_id, employee_user_id, employee_password, employee_name, employee_role_name, employee_is_active
      FROM employees
      WHERE employee_user_id = $1
      LIMIT 1;
    `;
    const result = await db.query(selectSql, [employee_user_id]);
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid user ID or password' },
        { status: 401 }
      );
    }
    const user = result.rows[0];

    if (!user.employee_is_active) {
      return NextResponse.json(
        { error: 'Invalid user ID or password' },
        { status: 401 }
      );
    }

    let passwordOk = false;
    const stored = user.employee_password || '';
    try {
      if (stored.startsWith('$2')) { // bcrypt 形式
        passwordOk = await bcrypt.compare(password, stored);
      } else {
        // 旧仕様(平文保存)フォールバック
        passwordOk = (password === stored);
      }
    } catch (e) {
      passwordOk = false;
    }

    if (!passwordOk) {
      return NextResponse.json(
        { error: 'Invalid user ID or password' },
        { status: 401 }
      );
    }

    if (!process.env.JWT_SECRET) {
      return NextResponse.json(
        { error: 'JWT_SECRET 未設定のためトークンを生成できません。' },
        { status: 500 }
      );
    }

    const tokenPayload = {
      employee_id: user.employee_id,
      employee_user_id: user.employee_user_id,
      role_name: user.employee_role_name,
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json(
      {
        access_token: accessToken,
        user: {
          employee_id: user.employee_id,
          employee_name: user.employee_name,
          role_name: user.employee_role_name,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('ログインAPI エラー:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
