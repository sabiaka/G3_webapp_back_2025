/**
 * ファイル概要
 * ==========
 * このファイルは 認証済みユーザー情報の取得API を提供します。
 * Authorization: Bearer <token> で受け取り、JWT検証後にDBから最新のユーザー情報を返します。
 */
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import db from '@/lib/db';

// 環境変数で詳細ログを制御: DEBUG_AUTH=1 のとき詳細ログ
const debug = (...args) => {
	if (process.env.DEBUG_AUTH === '1') {
		console.log('[auth/me]', ...args);
	}
};

/**
 * GET /api/auth/me
 * --------------------------------------
 * ログイン中のユーザー情報を返します。JWTを検証し、DBの最新状態を参照します。
 *
 * ヘッダー
 * - Authorization: Bearer <token>
 *
 * 成功時の戻り値（200）
 * - { employee_id, employee_name, role_id, role_name, is_admin, employee_color_code }
 * - _debug（DEBUG_AUTH=1の時のみ）: トークン由来の補助情報
 *
 * エラー
 * - 401 Unauthorized : Bearer欠如/無効トークン/ユーザー未存在/非アクティブ等。
 * - 500 Server DB error : DB接続・クエリ失敗。
 *
 * 実装方針の要点
 * - JWTを検証し、payloadの employee_id でDBから最新行を取得（roles JOIN）。
 * - DEBUG_AUTH=1 のとき詳細ログを出力し、診断を容易にする。
 */
export async function GET(request) {
	const start = Date.now();
	try {
		const auth = request.headers.get('authorization') || '';
		debug('raw authorization header =', auth);
		if (!auth.startsWith('Bearer ')) {
			debug('Authorization header missing Bearer prefix');
			return NextResponse.json({ error: 'Unauthorized: missing bearer' }, { status: 401 });
		}

		const token = auth.slice(7).trim();
		debug('token(length) =', token.length);

		if (!process.env.JWT_SECRET) {
			debug('JWT_SECRET not set');
			return NextResponse.json({ error: 'Server misconfiguration: JWT_SECRET' }, { status: 500 });
		}

		let payload;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET);
			debug('jwt payload =', payload);
		} catch (err) {
			debug('jwt.verify failed:', err?.name, err?.message);
			return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
		}

		const { employee_id, employee_user_id, role_id, role_name, exp } = payload || {};
		if (!employee_id) {
			debug('employee_id missing in payload');
			return NextResponse.json({ error: 'Unauthorized: no employee_id' }, { status: 401 });
		}

		// トークン期限の人間可読ログ
		if (exp) {
			const expiresAt = new Date(exp * 1000);
			debug('token exp (utc)=', expiresAt.toISOString());
		}

		const sql = `
			SELECT 
			  e.employee_id, 
			  e.employee_name, 
			  e.employee_is_active, 
			  e.employee_color_code,
			  e.employee_role_id,
			  r.role_name,
			  COALESCE(r.is_admin, FALSE) AS role_is_admin
			FROM employees e
			LEFT JOIN roles r ON r.role_id = e.employee_role_id
			WHERE e.employee_id = $1
			LIMIT 1
		`;
		let result;
		try {
			result = await db.query(sql, [employee_id]);
			debug('db rows length =', result.rows.length);
		} catch (dbErr) {
			debug('DB query error:', dbErr.message);
			return NextResponse.json({ error: 'Server DB error' }, { status: 500 });
		}

		if (result.rows.length === 0) {
			debug('employee not found for id', employee_id);
			return NextResponse.json({ error: 'Unauthorized: user not found' }, { status: 401 });
		}
		const row = result.rows[0];
		if (!row.employee_is_active) {
			debug('employee inactive');
			return NextResponse.json({ error: 'Unauthorized: inactive' }, { status: 401 });
		}

		const duration = Date.now() - start;
		debug('success in', duration + 'ms');

		return NextResponse.json({
			employee_id: row.employee_id,
			employee_name: row.employee_name,
			role_id: row.employee_role_id,
			role_name: row.role_name,
			is_admin: !!row.role_is_admin,
			employee_color_code: row.employee_color_code,
			// 参考用に要求があれば返す: employee_user_id, role_name(元payload)
			_debug: process.env.DEBUG_AUTH === '1' ? { employee_user_id, token_role_id: role_id, token_role_name: role_name } : undefined,
		});
	} catch (e) {
		console.error('auth/me unexpected error:', e);
		return NextResponse.json({ error: 'Unauthorized: unexpected' }, { status: 401 });
	}
}

export async function POST() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
