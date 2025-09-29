import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * JWT_SECRETを自動生成し、.envファイルに保存する関数
 */
function generateAndSaveJwtSecret() {
  try {
    // 64バイトのランダムな文字列を生成（base64エンコード）
    const jwtSecret = crypto.randomBytes(64).toString('base64');
    
    // プロジェクトルートの.envファイルのパス
    const envPath = path.join(process.cwd(), '.env');
    
    let envContent = '';
    
    // 既存の.envファイルがあれば読み込む
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // JWT_SECRETが既に存在するかチェック
      if (envContent.includes('JWT_SECRET=')) {
        // 既存のJWT_SECRETを更新
        envContent = envContent.replace(/JWT_SECRET=.*$/m, `JWT_SECRET=${jwtSecret}`);
      } else {
        // JWT_SECRETを追加
        envContent += `\nJWT_SECRET=${jwtSecret}\n`;
      }
    } else {
      // 新規.envファイルを作成
      envContent = `JWT_SECRET=${jwtSecret}\n`;
    }
    
    // .envファイルに書き込み
    fs.writeFileSync(envPath, envContent);
    
    // 環境変数を更新（現在のプロセスで即座に利用可能にする）
    process.env.JWT_SECRET = jwtSecret;
    
    console.log('JWT_SECRETを自動生成し、.envファイルに保存しました。');
    return jwtSecret;
  } catch (error) {
    console.error('JWT_SECRET生成エラー:', error);
    throw new Error('JWT_SECRETの自動生成に失敗しました。');
  }
}

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
        { error: 'ユーザーID と パスワード は必須です。' },
        { status: 400 }
      );
    }

    const selectSql = `
      SELECT 
        e.employee_id, 
        e.employee_user_id, 
        e.employee_password, 
        e.employee_name, 
        e.employee_is_active,
        e.employee_role_id,
        r.role_name
      FROM employees e
      LEFT JOIN roles r ON r.role_id = e.employee_role_id
      WHERE e.employee_user_id = $1
      LIMIT 1;
    `;
    const result = await db.query(selectSql, [employee_user_id]);
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'ユーザーID または パスワードが間違っています。' },
        { status: 401 }
      );
    }
    const user = result.rows[0];

    if (!user.employee_is_active) {
      return NextResponse.json(
        { error: 'ユーザーID または パスワードが間違っています。' },
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
        { error: 'ユーザーID または パスワードが間違っています。' },
        { status: 401 }
      );
    }

    // JWT_SECRETが未設定の場合は自動生成
    if (!process.env.JWT_SECRET) {
      try {
        generateAndSaveJwtSecret();
        console.log('JWT_SECRETが未設定だったため、自動生成しました。');
      } catch (generateError) {
        console.error('JWT_SECRET自動生成エラー:', generateError);
        return NextResponse.json(
          { error: 'JWT_SECRETの自動生成に失敗しました。' },
          { status: 500 }
        );
      }
    }

    const tokenPayload = {
      employee_id: user.employee_id,
      employee_user_id: user.employee_user_id,
      role_id: user.employee_role_id,
      role_name: user.role_name,
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json(
      {
        access_token: accessToken,
        user: {
          employee_id: user.employee_id,
          employee_name: user.employee_name,
          role_id: user.employee_role_id,
          role_name: user.role_name,
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
