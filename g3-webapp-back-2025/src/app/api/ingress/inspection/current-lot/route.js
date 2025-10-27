import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続 (db.queryが直接使えることを想定)

/**
 * 11. 現在生産中の lot_id を取得
 * (DB内で captured_at が最新の lot_id を1件返す)
 */
export async function GET(request) {
  try {
    // 1. DBから captured_at が最新の lot_id を1件取得
    const query = `
      SELECT lot_id
      FROM inspection_lots
      ORDER BY captured_at DESC
      LIMIT 1;
    `;
    
    const result = await db.query(query);

    // 2. 結果のハンドリング
    if (result.rows.length > 0) {
      // --- 200 OK: 見つかった場合 ---
      const currentLot = result.rows[0]; // { lot_id: "MAT-00123" }
      return NextResponse.json(
        { "lot_id": currentLot.lot_id },
        { status: 200 }
      );
    } else {
      // --- 204 NG: 見つからない場合 (仕様書通り) ---
      // (注: 仕様書では 204 となっていますが、
      // 200 OK でメッセージを返す方がクライアント側は扱いやすいです)
      // ここでは仕様書通り 204 で返します。
      return NextResponse.json(
        { "message": "現在生産しているロットはありません。" },
        { status: 204 } 
      );
    }

  } catch (error) {
    console.error('[API ERROR] /api/ingress/inspection/current-lot:', error);
    return NextResponse.json(
      { "error": "Internal Server Error", "details": error.message },
      { status: 500 }
    );
  }
}