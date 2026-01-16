/**
 * ファイル概要
 * ==========
 * このファイルは ログアウトAPI を提供します。ステートレスJWT運用前提のため、
 * サーバー側のセッションは持たず、必要であればCookieのトークンを即時無効化します。
 */
import { NextResponse } from 'next/server';

/*
 * POST /api/auth/logout
 * 現状: サーバー側にセッション保持なし(ステートレスJWT)なので
 *       フロント側が保持しているトークンを破棄すれば実質ログアウト完了。
 * 追加: 将来トークンをCookie(HttpOnly)で運用する場合に備えて
 *       空のCookieを即時失効させる Set-Cookie を返す実装を入れておく。
 * 備考: フロントで localStorage などに保存している場合はそちらも必ず削除すること。
 */
/**
 * POST /api/auth/logout
 * --------------------------------------
 * ログアウト処理。サーバーセッションなしのため、Cookie運用時のみSet-Cookieで無効化を返します。
 *
 * 成功時の戻り値（200）
 * - { message: "Successfully logged out" }
 *
 * エラー
 * - なし（ステートレス運用前提）
 */
export async function POST() {
	// 共通Cookie名 (必要に応じて統一): access_token
	// Secure は HTTPS 前提。本番のみ付与したい場合は環境変数で条件分岐してもOK。
	const cookieBase = 'access_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
	const cookie = process.env.NODE_ENV === 'production'
		? `${cookieBase}; Secure`
		: cookieBase;

	return new NextResponse(
		JSON.stringify({"message": "Successfully logged out"}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Set-Cookie': cookie,
			},
		}
	);
}

export async function GET() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
