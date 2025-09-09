import { NextResponse } from 'next/server';
import db from '@/lib/db'; // ← PrismaとかDBに接続するやつ
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    // 1. フロントから送られてきた情報をゲット
    const body = await request.json();
    const { employee_user_id, password } = body;

    // ユーザーIDとパスワードが入ってなかったら、そっこーエラー返す
    if (!employee_user_id || !password) {
      return NextResponse.json(
        { error: 'User ID and password are required' },
        { status: 400 }
      );
    }

    // 2. ユーザーIDを頼りにDBからユーザーを探す
    // ※ここではPrismaを使ってる想定で書いてるよ！
    const user = await db.employees.findUnique({
      where: {
        employee_user_id: employee_user_id,
      },
    });

    // 3. ユーザーが見つからないか、パスワードが違うかチェック
    // ユーザーがいない、またはアカウントが無効になってたらNG
    if (!user || !user.employee_is_active) {
      return NextResponse.json(
        { error: 'Invalid user ID or password' },
        { status: 401 } // 401: 認証失敗
      );
    }

    // bcryptでパスワードが合ってるかチェック！
    // DBに保存されてるハッシュ化されたパスワードと、入力された生のパスワードを比べる
    const isPasswordValid = await bcrypt.compare(password, user.employee_password);

    // パスワードが違ったらNG
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid user ID or password' },
        { status: 401 }
      );
    }

    // 4. 認証OK！アクセストークン（JWT）を作ってあげる
    const tokenPayload = {
      employee_id: user.employee_id,
      employee_user_id: user.employee_user_id,
      role_name: user.employee_role_name,
    };

    // 秘密鍵を使ってトークンを生成！有効期限は7日にしといた
    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    // 5. API設計書通りに、イケてるレスポンスを返す
    return NextResponse.json({
      access_token: accessToken,
      user: {
        employee_id: user.employee_id,
        employee_name: user.employee_name,
        role_name: user.employee_role_name,
      }
    }, { status: 200 });


  } catch (error) {
    console.error('ログインAPIでエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}
