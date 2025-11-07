import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 指定したセクションと日付の検査サマリーを取得するAPI
 * (UTCの日付を基準に検索)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. クエリパラメータを取得
    const sectionCode = searchParams.get('section');
    const dateParam = searchParams.get('date');

    if (!sectionCode) {
      return NextResponse.json(
        { message: '必須クエリパラメータ "section" が不足しています。' },
        { status: 400 }
      );
    }

    // 2. 検索対象の日付を決定
    let targetDate;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json(
          { message: 'クエリパラメータ "date" は YYYY-MM-DD 形式で指定してください。' },
          { status: 400 }
        );
      }
      targetDate = dateParam;
    } else {
      // JST変換せず、UTCの「本日」をデフォルト値とする
      targetDate = new Date().toISOString().split('T')[0];
    }

    const queryParams = [sectionCode, targetDate];

    // 3. データベースにクエリを実行
    // ▼ 基準日付はロットの代表時刻(l.captured_at)に合わせる（他APIと統一）
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'PASS') AS pass_count,
        COUNT(*) FILTER (WHERE s.status = 'FAIL') AS fail_count
      FROM
        inspection_camera_shots s
      INNER JOIN
        inspection_lots l ON s.lot_id_ref = l.id
      WHERE
        l.section_code = $1 AND
        to_char(l.captured_at, 'YYYY-MM-DD') = $2;
    `;

    const reasonsQuery = `
      SELECT
        s.details AS reason,
        -- ロット代表時刻を日付文字列として取得（他APIと統一）
        TO_CHAR(l.captured_at, 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM
        inspection_camera_shots s
      INNER JOIN
        inspection_lots l ON s.lot_id_ref = l.id
      WHERE
        l.section_code = $1 AND
        to_char(l.captured_at, 'YYYY-MM-DD') = $2 AND
        s.status = 'FAIL' AND
        s.details IS NOT NULL
      GROUP BY
        s.details,
        TO_CHAR(l.captured_at, 'YYYY-MM-DD')
      ORDER BY
        count DESC;
    `;

    const [summaryResult, reasonsResult] = await Promise.all([
      pool.query(summaryQuery, queryParams),
      pool.query(reasonsQuery, queryParams)
    ]);

  // デバッグログが多すぎると本番でノイズになるため最小限にする
  // console.debug('inspections/summary queryParams:', queryParams);

    // 4. レスポンスデータを組み立てる
    const passCount = parseInt(summaryResult.rows[0]?.pass_count || '0', 10);
    const failCount = parseInt(summaryResult.rows[0]?.fail_count || '0', 10);
    const totalCount = passCount + failCount;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    const responseData = {
      section: sectionCode,
      date: targetDate,
      total_count: totalCount,
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: passRate,
      fail_reasons: reasonsResult.rows,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバーで内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}