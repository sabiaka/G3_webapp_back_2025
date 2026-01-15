/**
 * ファイル概要
 * ==========
 * このファイルは 生産サマリー を取得するAPIを提供します。
 * 今日の集計、期間（週/月）サマリー、期間内の日次トレンド、上位不良理由をまとめて返します。
 * 期間の週は「日曜〜土曜」で区切り、月は当月全期間で集計します。
 */
 import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 生産サマリーデータを取得するAPI (GET) - カレンダー基準
 * @description GET /api/production/summary
 * @param request - period=week または period=month をクエリパラメータで指定
 *
 * 引数（Query Params）
 * - period : 'week' | 'month'（省略時 'week'）。週は日曜開始〜土曜終了、月は当月全期間。
 *
 * 成功時の戻り値（200）
 * - today_summary     : { plan, actual }（当日計画/実績の合計）
 * - period_summary    : { total_actual, total_defective, yield_rate, defective_reasons }
 *   - yield_rate      : 実績から不良を除いた歩留まり率（%）。実績が0の場合は 100。
 *   - defective_reasons : 上位5件の不良理由と件数配列。
 * - daily_trends      : 期間内の日毎の { date, plan, actual, defective } 配列。
 *
 * エラー
 * - 500 サーバーエラー：DBエラー等。
 *
 * 実装方針の要点
 * - periodに応じてWHERE句を動的組み立て。週は EXTRACT(DOW) を用いて日曜〜土曜を算出。
 * - SUM/COALESCE を活用し、NULLでも0扱いで集計が途切れないようにする。
 * - Promise.all で複数クエリを並列実行し、レスポンスをひとまとめに返す。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';

    const todaySummaryQuery = `
      SELECT
        COALESCE(SUM(prodreport_plan_quantity), 0) AS plan,
        COALESCE(SUM(prodreport_actual_quantity), 0) AS actual
      FROM production_reports
      WHERE prodreport_date = CURRENT_DATE;
    `;

    // --- 変更点：periodに応じたSQLのWHERE句を修正 ---
    let periodWhereClause;
    if (period === 'month') {
      // 今月の1日から末日までを取得
      periodWhereClause = `WHERE date_trunc('month', prodreport_date) = date_trunc('month', CURRENT_DATE)`;
    } else {
      // 今週の日曜日から土曜日までを取得
      const sunday = `(CURRENT_DATE - CAST(EXTRACT(DOW FROM CURRENT_DATE) AS INT))`;
      const saturday = `(CURRENT_DATE - CAST(EXTRACT(DOW FROM CURRENT_DATE) AS INT) + 6)`;
      periodWhereClause = `WHERE prodreport_date BETWEEN ${sunday} AND ${saturday}`;
    }

    const periodSummaryQuery = `
      SELECT
        COALESCE(SUM(prodreport_actual_quantity), 0) AS total_actual,
        COALESCE(SUM(prodreport_defective_quantity), 0) AS total_defective
      FROM production_reports
      ${periodWhereClause};
    `;

    const defectiveReasonsQuery = `
      SELECT
        prodreport_remarks AS reason,
        COUNT(*) AS count
      FROM production_reports
      ${periodWhereClause}
        AND prodreport_defective_quantity > 0
        AND prodreport_remarks IS NOT NULL
        AND prodreport_remarks != ''
      GROUP BY prodreport_remarks
      ORDER BY count DESC
      LIMIT 5;
    `;

    const dailyTrendsQuery = `
      SELECT
        TO_CHAR(prodreport_date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(prodreport_plan_quantity), 0) AS plan,
        COALESCE(SUM(prodreport_actual_quantity), 0) AS actual,
        COALESCE(SUM(prodreport_defective_quantity), 0) AS defective
      FROM production_reports
      ${periodWhereClause}
      GROUP BY prodreport_date
      ORDER BY prodreport_date ASC;
    `;

    // (以降のコードは変更ありません)
    const [
      todaySummaryResult,
      periodSummaryResult,
      defectiveReasonsResult,
      dailyTrendsResult,
    ] = await Promise.all([
      db.query(todaySummaryQuery),
      db.query(periodSummaryQuery),
      db.query(defectiveReasonsQuery),
      db.query(dailyTrendsQuery),
    ]);
    
    const today_summary = todaySummaryResult.rows[0];
    const periodSummaryData = periodSummaryResult.rows[0];
    const defective_reasons = defectiveReasonsResult.rows;
    const daily_trends = dailyTrendsResult.rows;
    
    const totalActual = Number(periodSummaryData.total_actual);
    const totalDefective = Number(periodSummaryData.total_defective);
    const yield_rate =
      totalActual > 0
        ? parseFloat(
            (((totalActual - totalDefective) / totalActual) * 100).toFixed(1)
          )
        : 100;

    const period_summary = {
      total_actual: totalActual,
      total_defective: totalDefective,
      yield_rate: yield_rate,
      defective_reasons: defective_reasons,
    };

    const responseData = {
      today_summary,
      period_summary,
      daily_trends,
    };

    return NextResponse.json(responseData);

  } catch (error)
  {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}