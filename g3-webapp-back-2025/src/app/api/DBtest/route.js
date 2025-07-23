// --- 必要なインポート ---
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DB接続用

export async function GET() {
  try {
    // productsテーブルから全データ取得
    const result = await db.query('SELECT * FROM products');
    return NextResponse.json({ products: result.rows });
  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'うわ、サーバーでエラーだって！' },
      { status: 500 }
    );
  }
}