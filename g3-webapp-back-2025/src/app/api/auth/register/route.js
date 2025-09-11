import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';

// このエンドポイントは登録専用とし、GETは404を返す
export async function GET() {
    return NextResponse.json(
        { error: 'このエンドポイントはPOSTのみ対応です。' },
        { status: 404 }
    );
}

/*
 * POST /api/auth/register
 * 入力必須: employee_user_id, password, employee_name
 * 任意    : employee_role_name (デフォルト: '一般'), employee_line_name (デフォルト: '未設定')
 * 処理概要:
 *  1. 入力バリデーション
 *  2. ユーザーID重複チェック (SELECT)
 *  3. パスワードハッシュ化 (bcrypt)
 *  4. INSERT (db.query)  ※他APIと同じSQLスタイルに統一
 *  5. 最小限の情報を返却（パスワードは含めない）
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            employee_user_id,
            password,
            employee_name,
            employee_role_name,
            employee_line_name,
            // 備考 & カラーコード（/api/employees に合わせて別名も許容）
            employee_special_notes,
            employee_color_code,
            special_notes,
            color_code,
        } = body || {};

        if (!employee_user_id || !password || !employee_name) {
            return NextResponse.json(
                { message: '必須項目 (employee_user_id, password, employee_name) が不足しています。' },
                { status: 400 }
            );
        }

        // 重複チェック
        const dupCheckSql = 'SELECT employee_user_id FROM employees WHERE employee_user_id = $1 LIMIT 1';
        const dupResult = await db.query(dupCheckSql, [employee_user_id]);
        if (dupResult.rows.length > 0) {
            return NextResponse.json(
                { message: 'そのユーザーIDは既に使用されています。' },
                { status: 409 }
            );
        }

        // パスワードハッシュ化（/api/employees のPOSTは平文だが、ここは安全性を優先）
        const hashedPassword = await bcrypt.hash(password, 10);

        // 備考とカラーコードの入力統一（両方のキー形式をサポート）
        let notesVal = employee_special_notes ?? special_notes ?? null;
        let colorVal = employee_color_code ?? color_code ?? null;

        // カラーコード (#付き/無し 両対応) バリデーション
        if (colorVal) {
            // 先頭#を除去
            if (colorVal.startsWith('#')) colorVal = colorVal.slice(1);
            const hexRegex = /^[0-9a-fA-F]{6}$/;
            if (!hexRegex.test(colorVal)) {
                return NextResponse.json(
                    { message: 'color_code は 6桁の16進数 (例: FF0000 または #FF0000) を指定してください。' },
                    { status: 400 }
                );
            }
        }

        const insertSql = `
            INSERT INTO employees (
                employee_user_id,
                employee_password,
                employee_name,
                employee_role_name,
                employee_line_name,
                employee_special_notes,
                employee_color_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING employee_id, employee_user_id, employee_name, employee_special_notes, employee_color_code;
        `;
        const roleVal = employee_role_name || '一般';
        const lineVal = employee_line_name || '未設定';
        const insertParams = [
            employee_user_id,
            hashedPassword,
            employee_name,
            roleVal,
            lineVal,
            notesVal,
            colorVal,
        ];

        const insertResult = await db.query(insertSql, insertParams);
    const newUser = insertResult.rows[0];

        return NextResponse.json(
            {
                message: 'ユーザー登録成功',
                user: newUser,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('ユーザー登録API エラー:', error);
        // ユニーク制約エラー (PostgreSQL エラーコード 23505) の場合
        if (error.code === '23505') {
            return NextResponse.json(
                { message: 'そのユーザーIDは既に使用されています。(unique constraint)' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { message: 'サーバーエラーが発生しました。' },
            { status: 500 }
        );
    }
}
