// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続用

export async function GET(request) {
  try {
    // クエリパラメータ取得
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    let query = 'SELECT * FROM 従業員';
    if (sort === 'price') {
      query += ' ORDER BY price ASC';
    }

    const result = await db.query(query);
    return NextResponse.json({ products: result.rows });
  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバー側でエラー' },
      { status: 500 }
    );
  }
}