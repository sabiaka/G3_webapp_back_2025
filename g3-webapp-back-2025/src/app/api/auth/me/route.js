import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import db from '@/lib/db';

// 環境変数で詳細ログを制御: DEBUG_AUTH=1 のとき詳細ログ
const debug = (...args) => {
	if (process.env.DEBUG_AUTH === '1') {
		console.log('[auth/me]', ...args);
	}
};

// GET /api/auth/me
// Authorization: Bearer <token>
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

		const { employee_id, employee_user_id, role_name, exp } = payload || {};
		if (!employee_id) {
			debug('employee_id missing in payload');
			return NextResponse.json({ error: 'Unauthorized: no employee_id' }, { status: 401 });
		}

		// トークン期限の人間可読ログ
		if (exp) {
			const expiresAt = new Date(exp * 1000);
			debug('token exp (utc)=', expiresAt.toISOString());
		}

		const sql = `SELECT employee_id, employee_name, employee_role_name, employee_is_active FROM employees WHERE employee_id = $1 LIMIT 1`;
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
			role_name: row.employee_role_name,
			// 参考用に要求があれば返す: employee_user_id, role_name(元payload)
			_debug: process.env.DEBUG_AUTH === '1' ? { employee_user_id, token_role: role_name } : undefined,
		});
	} catch (e) {
		console.error('auth/me unexpected error:', e);
		return NextResponse.json({ error: 'Unauthorized: unexpected' }, { status: 401 });
	}
}

export async function POST() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
