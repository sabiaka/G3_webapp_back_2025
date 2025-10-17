import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 利用可能な日付一覧を返すAPI
 * GET /api/instructions/available-dates
 *
 * クエリ:
 * - limit: 返却件数の上限（省略可 / 正の整数）
 *
 * レスポンス例:
 * ["2025-08-01", "2025-08-03", "2025-08-04"]
 */
export async function GET(request) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const limitParam = searchParams.get('limit');

        const whereClauses = [];
        const params = [];
        let paramIndex = 1;

        // 既定では全件（通知が存在する全日付）。必要に応じて他条件を拡張予定。

        // ベースSQL: サーバー側タイムゾーン（日単位）に正規化されたユニーク日付
        // セッションは JST 固定のため、 ::date で日付化すれば JST 基準となる
                let sql = `
            SELECT TO_CHAR(n.notification_data_time::date, 'YYYY-MM-DD') AS d
            FROM notifications n
        `;

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        sql += ' GROUP BY d ORDER BY d DESC';

        // limit 指定があれば付与
        if (limitParam !== null) {
            const limit = Number(limitParam);
            if (!Number.isInteger(limit) || limit <= 0) {
                return NextResponse.json(
                    { message: 'limit は正の整数で指定してください。' },
                    { status: 400 }
                );
            }
            sql += ` LIMIT $${paramIndex++}`;
            params.push(limit);
        }

        const { rows } = await db.query(sql, params);
        // pg は DATE 型を文字列(YYYY-MM-DD)として返すため、そのまま返却
        const dates = rows.map((r) => r.d);

        return NextResponse.json(dates);
    } catch (error) {
        console.error('API Error (/api/instructions/available-dates):', error);
        return NextResponse.json(
            { message: 'サーバーエラーが発生しました。' },
            { status: 500 }
        );
    }
}
