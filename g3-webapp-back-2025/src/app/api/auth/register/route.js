/**
 * ファイル概要
 * ==========
 * このファイルは ユーザー登録API を提供します。生SQL + db.query で既存名からID解決に対応し、
 * bcryptでパスワードをハッシュ化して登録します。カラーコードは6桁HEXに統一します。
 */
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

/**
 * POST /api/auth/register
 * --------------------------------------
 * 新規ユーザーを登録します。ロール/ラインはID優先、名称指定時は既存名からID解決します。
 *
 * リクエストボディ（JSON）
 * - employee_user_id : 文字列（必須）
 * - password         : 文字列（必須）
 * - employee_name    : 文字列（必須）
 * - employee_role_id / employee_role_name : 数値 or 文字列（いずれかで指定）
 * - employee_line_id / employee_line_name : 数値 or 文字列（いずれかで指定）
 * - employee_special_notes / special_notes : 文字列 | null
 * - employee_color_code / color_code       : 文字列 | null（#付き/無し両対応、6桁HEX）
 *
 * 成功時の戻り値（201）
 * - message: 'ユーザー登録成功'
 * - user   : INSERT後の行（passwordは含まない）
 *
 * エラー
 * - 400 入力不足/ID解決失敗/ID未存在 : 必須項目不足、名称で解決できない、指定ID未存在。
 * - 409 既存ユーザーID               : 重複（23505）。
 * - 500 サーバーエラー               : DB/ハッシュ化失敗等。
 *
 * 実装方針の要点
 * - まず名称からIDを解決（roles, production_lines）。未解決なら400。
 * - bcryptでハッシュ化したパスワードを保存。カラーコードは6桁HEXの大文字に正規化。
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            employee_user_id,
            password,
            employee_name,
            // ID優先
            employee_role_id,
            employee_line_id,
            // 名称フォールバック（任意）
            employee_role_name,
            employee_line_name,
            // 備考 & カラーコード（両方のキー形式を許容）
            employee_special_notes,
            employee_color_code,
            special_notes,
            color_code,
        } = body || {};

        // 必須チェック
        if (!employee_user_id || !password || !employee_name) {
            return NextResponse.json(
                { message: '必須項目 (employee_user_id, password, employee_name) が不足しています。' },
                { status: 400 }
            );
        }

        // ロール/ラインのIDを確定（ID優先、無ければ名称から解決）
        let roleId = employee_role_id ?? null;
        let lineId = employee_line_id ?? null;

        if (!roleId && employee_role_name) {
            const roleSql = 'SELECT role_id FROM roles WHERE role_name = $1 LIMIT 1';
            const roleRes = await db.query(roleSql, [employee_role_name]);
            if (roleRes.rows.length === 0) {
                return NextResponse.json(
                    { message: '指定されたemployee_role_nameが存在しません。' },
                    { status: 400 }
                );
            }
            roleId = roleRes.rows[0].role_id;
        }

        if (!lineId && employee_line_name) {
            const lineSql = 'SELECT line_id FROM production_lines WHERE line_name = $1 LIMIT 1';
            const lineRes = await db.query(lineSql, [employee_line_name]);
            if (lineRes.rows.length === 0) {
                return NextResponse.json(
                    { message: '指定されたemployee_line_nameが存在しません。' },
                    { status: 400 }
                );
            }
            lineId = lineRes.rows[0].line_id;
        }

        if (!roleId || !lineId) {
            return NextResponse.json(
                { message: 'employee_role_id と employee_line_id は必須です（名称を指定する場合は既存名で解決されます）。' },
                { status: 400 }
            );
        }

        // 役割/ラインの存在チェック（数値IDが来た場合）
        if (roleId) {
            const r = await db.query('SELECT 1 FROM roles WHERE role_id = $1', [roleId]);
            if (r.rows.length === 0) {
                return NextResponse.json(
                    { message: '指定されたemployee_role_idが存在しません。' },
                    { status: 400 }
                );
            }
        }
        if (lineId) {
            const l = await db.query('SELECT 1 FROM production_lines WHERE line_id = $1', [lineId]);
            if (l.rows.length === 0) {
                return NextResponse.json(
                    { message: '指定されたemployee_line_idが存在しません。' },
                    { status: 400 }
                );
            }
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

        // パスワードハッシュ化
        const hashedPassword = await bcrypt.hash(password, 10);

        // 備考とカラーコードの入力統一（両方のキー形式をサポート）
        let notesVal = employee_special_notes ?? special_notes ?? null;
        let colorVal = employee_color_code ?? color_code ?? null;

        // カラーコード (#付き/無し 両対応) バリデーション
        if (colorVal) {
            if (typeof colorVal === 'string' && colorVal.startsWith('#')) colorVal = colorVal.slice(1);
            const hexRegex = /^[0-9a-fA-F]{6}$/;
            if (!hexRegex.test(colorVal)) {
                return NextResponse.json(
                    { message: 'employee_color_code は 6桁の16進数 (例: FF0000 または #FF0000) を指定してください。' },
                    { status: 400 }
                );
            }
            // DBはCHAR(6)なので大文字で統一
            colorVal = colorVal.toUpperCase();
        }

        const insertSql = `
            INSERT INTO employees (
                employee_user_id,
                employee_password,
                employee_name,
                employee_role_id,
                employee_line_id,
                employee_special_notes,
                employee_color_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING employee_id, employee_user_id, employee_name, employee_role_id, employee_line_id, employee_special_notes, employee_color_code;
        `;

        const insertParams = [
            employee_user_id,
            hashedPassword,
            employee_name,
            roleId,
            lineId,
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
