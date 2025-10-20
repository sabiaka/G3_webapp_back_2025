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
    // ▼ WHERE句で ::date を使い、UTC日付で比較します
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
        (s.captured_at at time zone 'UTC')::date = $2;
    `;

    const reasonsQuery = `
      SELECT
        s.details AS reason,
        -- captured_atをUTC基準の日付文字列 'YYYY-MM-DD' に変換して取得
        TO_CHAR(s.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM
        inspection_camera_shots s
      INNER JOIN
        inspection_lots l ON s.lot_id_ref = l.id
      WHERE
        l.section_code = $1 AND
        -- summaryQuery と条件を合わせるため、こちらもUTC基準で比較
        (s.captured_at AT TIME ZONE 'UTC')::date = $2 AND
        s.status = 'FAIL' AND
        s.details IS NOT NULL
      GROUP BY
        s.details,
        date -- SELECT句のエイリアス 'date' を使う
      ORDER BY
        count DESC;
    `;

    const [summaryResult, reasonsResult] = await Promise.all([
      pool.query(summaryQuery, queryParams),
      pool.query(reasonsQuery, queryParams)
    ]);

    console.log('summaryQuery:', queryParams);
    console.log('reasonsQuery:', queryParams);
    console.log('summaryResult:', summaryResult);
    console.log('reasonsResult:', reasonsResult);

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