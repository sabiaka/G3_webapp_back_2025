import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 生産サマリーデータを取得するAPI (GET) - カレンダー基準
 * @description GET /api/production/summary
 * @param request - period=week または period=month をクエリパラメータで指定
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