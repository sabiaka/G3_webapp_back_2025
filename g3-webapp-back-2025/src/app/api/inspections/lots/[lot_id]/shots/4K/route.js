/**
 * ファイルの役割:
 *   指定ロットの4Kショットを重複排除して一覧返却し、OK/NG率も集計するAPI。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API 3.1: 4Kショット一覧（重複排除） + ★進捗集計 (OK/NG率)
 * (GET /api/inspections/lots/{lot_id}/shots/4K)
 * ★JSONキーを "c4k_seq" に変更
 *
 * 説明:
 *   c4k_seqごとに最新1件を代表として返却し、PASS/その他(NG)の比率を算出する。
 *
 * I/O:
 *   @param {Request} request                                   - リクエスト
 *   @param {{ params: { lot_id: string } }} context            - パスパラメータ
 *   @returns {NextResponse}                                     - JSON: { lot_id, summary, shots }
 *
 * ステータス:
 *   200                                                         - 成功
 *   404                                                         - ロット未発見
 *   500                                                         - サーバ内部エラー
 */
export async function GET(request, context) {
  const { lot_id } = await context.params; 
  
  try {
    // 1. lot_id 検索
    const lotResult = await pool.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1',
      [lot_id]
    );

    if (lotResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Not Found", details: `指定された lot_id (${lot_id}) が見つかりません。` },
        { status: 404 }
      );
    }
    const lotIdRef = lotResult.rows[0].id;

    // 2. 4Kショット一覧を取得
    // "DISTINCT ON (c4k_seq)" を使い、c4k_seq ごとに最新の1件(id DESC)を代表として取得
    const distinctQuery = `
      SELECT DISTINCT ON (c4k_seq)
        camera_id,
        c4k_seq,  -- ★変更: エイリアス(AS "4k_seq")を削除し、そのまま出力
        shot_seq,
        status,
        details,
        image_path
      FROM
        inspection_camera_shots
      WHERE
        lot_id_ref = $1
        AND c4k_seq IS NOT NULL
      ORDER BY
        c4k_seq ASC, id DESC;
    `;

    const shotsResult = await pool.query(distinctQuery, [lotIdRef]);
    const shots = shotsResult.rows;

    // --- ★追加: 集計ロジック (Summary) ---
    const total = shots.length;
    let okCount = 0;
    let ngCount = 0;

    shots.forEach(shot => {
      if (shot.status === 'PASS') {
        okCount++;
      } else {
        // FAIL または MISSING は NG としてカウント
        ngCount++;
      }
    });

    // 比率計算 (0除算回避, 小数点第1位まで)
    const okRate = total > 0 ? Math.round((okCount / total) * 1000) / 10 : 0;
    const ngRate = total > 0 ? Math.round((ngCount / total) * 1000) / 10 : 0;
    // ------------------------------------

    // 3. 成功レスポンス
    return NextResponse.json({
      lot_id: lot_id,
      summary: {
        total: total,
        ok_count: okCount,
        ng_count: ngCount,
        ok_rate: okRate,
        ng_rate: ngRate
      },
      shots: shots // 各ショットの中に "c4k_seq" が含まれます
    });

  } catch (error) {
    console.error(`API Error (GET /shots/4K/${lot_id}):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}