import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 指定した日付の検査サマリーを取得するAPI (GET)
 * @description ?type= で指定されたカメラ名（前方一致）で結果を絞り込みます。
 * @param {Request} request - Next.jsのRequestオブジェクト
 * @returns {NextResponse} - 検査サマリーのJSONレスポンス
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // カメラ名を直接受け取る
    let date = searchParams.get('date');

    // dateパラメータがなければ今日の日付をセット
    if (!date) {
      const today = new Date();
      today.setHours(today.getHours() + 9); // JSTに調整
      date = today.toISOString().split('T')[0];
    }

    // --- ▼ 修正点: エイリアス変換マップを削除 ▼ ---
    // typeとカメラ名を対応付ける変換ロジックは不要になったため削除しました。
    // --- ▲ 修正点 ▲ ---

    // --- クエリ構築 ---
    const queryParams = [date];
    const whereClauses = [`DATE(inspection_inspected_time) = $1`];
    let paramIndex = 2;

    // --- ▼ 修正点: typeによる前方一致検索に変更 ▼ ---
    // typeが指定された場合、前方一致で絞り込み条件を追加
    if (type) {
      whereClauses.push(`inspection_camera_id LIKE $${paramIndex++}`);
      queryParams.push(`${type}%`); // 前方一致検索
    }
    // --- ▲ 修正点 ▲ ---

    const whereString = whereClauses.join(' AND ');
    
    // 検査結果の全体数を取得するクエリ
    const countsQuery = `
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE UPPER(inspection_result) = 'PASS') AS pass_count,
        COUNT(*) FILTER (WHERE UPPER(inspection_result) = 'FAIL') AS fail_count
      FROM 
        inspection_results
      WHERE 
        ${whereString};
    `;

    // 不良理由の内訳を取得するクエリ
    const reasonsQuery = `
      SELECT
        inspection_reason AS reason,
        COUNT(*) AS count
      FROM 
        inspection_results
      WHERE 
        UPPER(inspection_result) = 'FAIL' 
        AND inspection_reason IS NOT NULL 
        AND ${whereString}
      GROUP BY 
        inspection_reason
      ORDER BY 
        count DESC;
    `;
    
    // DBへの問い合わせを並列実行
    const [countsResult, reasonsResult] = await Promise.all([
      db.query(countsQuery, queryParams),
      db.query(reasonsQuery, queryParams)
    ]);
    
    // --- レスポンス整形 ---
    if (countsResult.rows.length === 0) {
      return NextResponse.json({
        total_count: 0,
        pass_count: 0,
        fail_count: 0,
        pass_rate: 0,
        fail_reasons: [],
      });
    }
    
    const counts = countsResult.rows[0];
    const total_count = parseInt(counts.total_count, 10);
    const pass_count = parseInt(counts.pass_count, 10);
    const fail_count = parseInt(counts.fail_count, 10);

    const pass_rate = total_count > 0 
      ? parseFloat(((pass_count / total_count) * 100).toFixed(1)) 
      : 0;

    const fail_reasons = reasonsResult.rows.map(row => ({
      reason: row.reason,
      count: parseInt(row.count, 10)
    }));

    const summary = {
      total_count,
      pass_count,
      fail_count,
      pass_rate,
      fail_reasons
    };

    return NextResponse.json(summary);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}