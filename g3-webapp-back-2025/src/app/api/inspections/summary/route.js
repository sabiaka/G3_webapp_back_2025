import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 指定したセクションと日付の検査サマリーを取得するAPI
 * * 日付指定がない場合：そのセクションでデータが存在する「最新の日付」を自動選択
 * 日付指定がある場合：指定された日付（YYYY-MM-DD）を使用
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
      // A. 日付が指定されている場合：形式チェックして使用
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json(
          { message: 'クエリパラメータ "date" は YYYY-MM-DD 形式で指定してください。' },
          { status: 400 }
        );
      }
      targetDate = dateParam;
    } else {
      // B. 日付が指定されていない場合：DBから「最新のデータがある日付」を取得する
      try {
        const latestDateQuery = `
          SELECT to_char(captured_at, 'YYYY-MM-DD') as latest_date
          FROM inspection_lots
          WHERE section_code = $1
          ORDER BY captured_at DESC
          LIMIT 1;
        `;
        
        // ここでawaitを使って最新日付を確認
        const latestResult = await pool.query(latestDateQuery, [sectionCode]);

        if (latestResult.rows.length > 0) {
          // データが見つかればその日付を採用
          targetDate = latestResult.rows[0].latest_date;
        } else {
          // データが1件もない場合は、フォールバックとしてUTCの「本日」を使用
          targetDate = new Date().toISOString().split('T')[0];
        }
      } catch (e) {
        console.error('Latest date fetch error:', e);
        // エラー時は安全策として「本日」を設定
        targetDate = new Date().toISOString().split('T')[0];
      }
    }

    const queryParams = [sectionCode, targetDate];

    // 3. データベースにクエリを実行 (集計と理由内訳)
    // ▼ 基準日付はロットの代表時刻(l.captured_at)に合わせる
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

    // 4. レスポンスデータを組み立てる
    const passCount = parseInt(summaryResult.rows[0]?.pass_count || '0', 10);
    const failCount = parseInt(summaryResult.rows[0]?.fail_count || '0', 10);
    const totalCount = passCount + failCount;
    // 合格率の計算 (ゼロ除算対策)
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    const responseData = {
      section: sectionCode,
      date: targetDate, // 実際に使用された日付を返す
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