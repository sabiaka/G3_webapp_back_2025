import { NextResponse } from 'next/server';
import db from '@/lib/db'; // PrismaとかDBに接続するやつ
import bcrypt from 'bcrypt';

export async function GET(request) {
    return NextResponse.json(
        { error: 'GETにAPIは対応していません。' },
        { status: 404 }
    );
}

export async function POST(request) {
    try {
        // 1. フロントからユーザーIDとかパスワードを受け取る
        const body = await request.json();
        const { employee_user_id, password, employee_name, employee_role_name, employee_line_name } = body;

        // 最低限の情報が入ってなかったらエラー
        if (!employee_user_id || !password || !employee_name) {
            return NextResponse.json(
                { error: '必要な情報が足りてないよ！' },
                { status: 400 }
            );
        }

        // すでに同じユーザーIDの人がいないかチェック
        const existingUser = await db.employees.findUnique({
            where: { employee_user_id },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'そのユーザーIDはもう使われてるよん' },
                { status: 409 } // 409: 競合
            );
        }

        // 2. ここが最重要！パスワードをハッシュ化する✨
        // 10っていうのはセキュリティの強さ。このままでOK！
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. DBに新しいユーザー情報を保存する
        // 保存するのは、もちろんハッシュ化した後のパスワードね！
        const newUser = await db.employees.create({
            data: {
                employee_user_id: employee_user_id,
                employee_password: hashedPassword, // ← ハッシュ化したやつをIN！
                employee_name: employee_name,
                employee_role_name: employee_role_name || '一般', // 指定がなければ'一般'
                employee_line_name: employee_line_name || '未設定', // 指定がなければ'未設定'
                // 他のデータも必要に応じて追加してね
            },
        });

        // 4. 成功したことをフロントに伝える
        // ※レスポンスにパスワードは絶対含めちゃダメだよ！
        return NextResponse.json({
            message: 'ユーザー登録大成功！',
            user: {
                employee_id: newUser.employee_id,
                employee_user_id: newUser.employee_user_id,
                employee_name: newUser.employee_name,
            }
        }, { status: 201 }); // 201: 作成成功

    } catch (error) {
        console.error('ユーザー登録APIでエラー発生！:', error);
        return NextResponse.json(
            { message: 'サーバーでエラーが発生しました。' },
            { status: 500 }
        );
    }
}
