import { NextResponse } from 'next/server';

// GETリクエスト（「データちょうだい！」）が来たら、ここが動くよ
export async function GET() {
  // サンプルの商品データ
  const items = [
    { id: 1, name: '最強のリップ💄' },
    { id: 2, name: 'イケてるネイル💅' },
    { id: 3, name: '魔法のファンデ✨' },
  ];

  // JSON形式でデータを返すよ
  return NextResponse.json({ items });
}