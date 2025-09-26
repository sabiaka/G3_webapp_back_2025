import { NextResponse } from 'next/server';

// 10.0.0.0/8 の IPv4 アドレスかを判定
function isPrivate10Origin(origin) {
    if (!origin) return false;
    try {
        const url = new URL(origin);
        const host = url.hostname; // 例: "10.1.2.3"
        // IPv6 やホスト名は対象外。単純な 10.*.*.* (IPv4) を許可
        const m = host.match(/^10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return false;
        // 0-255 範囲チェック（形式的に実施）
        return m.slice(1).every((oct) => {
            const n = Number(oct);
            return n >= 0 && n <= 255;
        });
    } catch (_) {
        return false;
    }
}

function buildCorsHeaders(origin, allowHeaders) {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    );
    if (allowHeaders) {
        headers.set('Access-Control-Allow-Headers', allowHeaders);
    } else {
        headers.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, X-Requested-With'
        );
    }
    headers.set('Access-Control-Max-Age', '86400');
    return headers;
}

export function middleware(request) {
    const origin = request.headers.get('origin');
    const isPreflight = request.method === 'OPTIONS';

    if (!origin) {
        // CORS ではないアクセスはそのまま通す
        if (isPreflight) {
            // Origin のない OPTIONS は想定外だが、素通し
            return new Response(null, { status: 204 });
        }
        return NextResponse.next();
    }

    const allowed = isPrivate10Origin(origin);

    if (!allowed) {
        // 許可対象外: 通常リクエストはCORSヘッダなしで通し、ブラウザ側でブロックさせる
        if (isPreflight) {
            // プリフライトは拒否
            return new Response(null, { status: 403 });
        }
        return NextResponse.next();
    }

    // 許可対象: ヘッダ付与
    if (isPreflight) {
        const acrh = request.headers.get('access-control-request-headers') || undefined;
        return new Response(null, { status: 204, headers: buildCorsHeaders(origin, acrh) });
    }

    const res = NextResponse.next();
    const headers = buildCorsHeaders(origin);
    headers.forEach((value, key) => res.headers.set(key, value));
    return res;
}

// /api 以下にのみ適用
export const config = {
    matcher: ['/api/:path*'],
};
