import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 今日の検査サマリーを取得するAPI (GET)
 * @param {Request} request Next.jsから渡されるリクエストオブジェクト
 * @returns {NextResponse} 今日の集計結果またはエラーメッセージを含むレスポンス
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. クエリパラメータの取得と検証
    const sectionCode = searchParams.get('section');

    if (!sectionCode) {
      return NextResponse.json(
        { message: '必須クエリパラメータ "section" が不足しています。' },
        { status: 400 }
      );
    }

    // 2. 日付を常にJST（日本時間）の「今日」に設定
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(Date.now() + jstOffset);
    const targetDate = jstDate.toISOString().split('T')[0];

    // 3. データベースからデータを集計
    const queryParams = [sectionCode, targetDate];

    // --- クエリ1: 良品数(pass_count)と不良品数(fail_count)を集計 ---
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
          CAST(l.captured_at AS DATE) = $2 AND
          s.status IN ('PASS', 'FAIL');
    `;
    const summaryResult = await pool.query(summaryQuery, queryParams);

    // --- クエリ2: 不良理由(fail_reasons)とその件数を集計 ---
    const reasonsQuery = `
      SELECT
          s.details AS reason,
          COUNT(*) AS count
      FROM
          inspection_camera_shots s
      INNER JOIN
          inspection_lots l ON s.lot_id_ref = l.id
      WHERE
          l.section_code = $1 AND
          CAST(l.captured_at AS DATE) = $2 AND
          s.status = 'FAIL' AND
          s.details IS NOT NULL
      GROUP BY
          s.details
      ORDER BY
          count DESC;
    `;
    const reasonsResult = await pool.query(reasonsQuery, queryParams);
    
    // 4. レスポンスデータを組み立てる
    const passCount = parseInt(summaryResult.rows[0]?.pass_count || '0', 10);
    const failCount = parseInt(summaryResult.rows[0]?.fail_count || '0', 10);
    const totalCount = passCount + failCount;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    const responseData = {
      section: sectionCode,
      date: targetDate, // レスポンスには今日の日付を含めます
      total_count: totalCount,
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: passRate,
      fail_reasons: reasonsResult.rows,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}