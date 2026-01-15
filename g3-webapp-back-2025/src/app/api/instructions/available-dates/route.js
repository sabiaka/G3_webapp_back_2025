/**
 * ファイルの役割:
 *   製造指示が存在する日付一覧(降順)と各日の件数を返すAPI。
 *   ::date によりサーバ側タイムゾーン(JST前提)で日単位集計する。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 利用可能な日付ごとの件数一覧を返すAPI (GET)
 * GET /api/instructions/available-dates
 *
 * 説明:
 *   notifications の notification_data_time から日付を抽出し、日付ごとに件数を集計する。
 *
 * I/O:
 *   @param {Request} request                                   - クエリを含むリクエスト
 *   @returns {NextResponse}                                     - JSON: Array<{ date: string, count: number }>
 *
 * クエリ:
 *   limit                                                       - 返却件数の上限(正の整数, 任意)
 *
 * ステータス:
 *   200                                                         - 成功
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー
 *
 * レスポンス例:
 *   [{ "date": "2025-08-04", "count": 12 }, { "date": "2025-08-03", "count": 7 }]
 */
export async function GET(request) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const limitParam = searchParams.get('limit');

        const whereClauses = [];
        const params = [];
        let paramIndex = 1;

        // 既定では全件（通知が存在する全日付）。必要に応じて他条件を拡張予定。

        // ベースSQL: サーバー側タイムゾーン（日単位）に正規化されたユニーク日付と件数
        // セッションは JST 固定のため、 ::date で日付化すれば JST 基準となる
        let sql = `
            SELECT
                TO_CHAR(n.notification_data_time::date, 'YYYY-MM-DD') AS d,
                COUNT(*) AS c
            FROM notifications n
        `;

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

    sql += ' GROUP BY d ORDER BY d DESC';

        // limit 指定があれば付与
        // なぜ: 大量データ時のレスポンス抑制とUI負荷軽減のため
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
    // 文字列化された日付と件数をオブジェクト配列で返却
    const result = rows.map((r) => ({ date: r.d, count: Number(r.c) }));

    return NextResponse.json(result);
    } catch (error) {
        console.error('API Error (/api/instructions/available-dates):', error);
        return NextResponse.json(
            { message: 'サーバーエラーが発生しました。' },
            { status: 500 }
        );
    }
}
