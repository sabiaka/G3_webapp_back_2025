/**
 * ファイルの役割:
 * セクション×日付の検査サマリー(件数/合格率/不良理由内訳)を返すAPI。
 * 日付未指定時はそのセクションでデータが存在する最新日付を自動選択する。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

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
      try {
        // 【修正】最新日付取得を日本時間ベースで行う
        const latestDateQuery = `
          SELECT to_char(captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as latest_date
          FROM inspection_lots
          WHERE section_code = $1
          ORDER BY captured_at DESC
          LIMIT 1;
        `;
        
        const latestResult = await pool.query(latestDateQuery, [sectionCode]);

        if (latestResult.rows.length > 0) {
          targetDate = latestResult.rows[0].latest_date;
        } else {
          // 【修正】フォールバックの日付を日本時間(JST)の現在日にする
          targetDate = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        }
      } catch (e) {
        console.error('Latest date fetch error:', e);
        targetDate = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
      }
    }

    const queryParams = [sectionCode, targetDate];

    // 3. データベースにクエリを実行 (集計と理由内訳)
    // 【修正】l.captured_at を日本時間に変換してから比較
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'PASS' OR s.status = 'OK') AS pass_count,
        COUNT(*) FILTER (WHERE s.status = 'FAIL' OR s.status = 'NG') AS fail_count
      FROM
        inspection_camera_shots s
      INNER JOIN
        inspection_lots l ON s.lot_id_ref = l.id
      WHERE
        l.section_code = $1 AND
        to_char(l.captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = $2;
    `;

    // 【修正】GROUP BY と SELECT 内の抽出も日本時間ベースに統一
    const reasonsQuery = `
      SELECT
        s.details AS reason,
        to_char(l.captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM
        inspection_camera_shots s
      INNER JOIN
        inspection_lots l ON s.lot_id_ref = l.id
      WHERE
        l.section_code = $1 AND
        to_char(l.captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = $2 AND
        (s.status = 'FAIL' OR s.status = 'NG') AND
        s.details IS NOT NULL
      GROUP BY
        s.details,
        to_char(l.captured_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
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