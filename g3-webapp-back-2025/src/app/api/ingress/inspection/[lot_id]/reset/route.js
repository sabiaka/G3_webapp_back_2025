import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API: 検査ステータスのリセット
 * 指定された lot_id のショットのうち、status が 'MISSING' 以外のものを 'MISSING' に戻し、details を NULL にする。
 * (POST /api/ingress/inspection/{lot_id}/reset)
 */
export async function POST(request, { params }) {
  const { lot_id } = params;

  try {
    // 1. lot_id (文字列) から 親ロットの内部ID (lot_id_ref) を検索
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

    // 2. ステータスをリセットする (UPDATE)
    // 条件: lot_id_ref が一致し、かつ status が 'MISSING' ではないもの
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET 
        status = 'MISSING',
        details = NULL
      WHERE 
        lot_id_ref = $1 
        AND status != 'MISSING';
    `;

    const result = await pool.query(updateQuery, [lotIdRef]);

    // 3. 成功レスポンス
    return NextResponse.json({
      message: "検査ステータスをリセットしました。",
      lot_id: lot_id,
      updated_count: result.rowCount // 何件リセットしたかを返す
    });

  } catch (error) {
    console.error(`API Error (POST /inspection/${lot_id}/reset):`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}