import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * 最新のイベント情報（最後に登録されたロットの作成時刻）を返す (GET)
 */
export async function GET(request) {
  try {
    // データベースから最新のロットを1件だけ取得するクエリ
    // idでソートする方が、インデックスが効いて高速な場合が多い
    const latestEventQuery = `
      SELECT created_at
      FROM inspection_lots
      ORDER BY id DESC
      LIMIT 1;
    `;

    const result = await pool.query(latestEventQuery);

    // DBにまだ1件もデータがない場合も考慮
    let latestEventTime = null;
    if (result.rows.length > 0) {
      latestEventTime = result.rows[0].created_at;
    }

    const responseData = {
      latest_event_time: latestEventTime,
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