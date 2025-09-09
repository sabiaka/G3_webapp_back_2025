// src/app/api/racks/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // ←あなたの接続ユーティリティに合わせて

// GET /api/racks            → 全件
// GET /api/racks?id=1       → id=1 のみ
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get('id');

  try {
    if (idParam !== null) {
      const id = Number(idParam);
      if (!Number.isInteger(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
      }

      const result = await db.query(
        'SELECT rack_id, rack_name, rows, cols FROM racks WHERE rack_id = $1',
        [id]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(result.rows[0]);
    }

    // id が無ければ全件
    const result = await db.query(
      'SELECT rack_id, rack_name, rows, cols FROM racks ORDER BY rack_id'
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('[GET /api/racks] DB error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 新規作成: POST /api/racks
export async function POST(req) {
  try {
    const body = await req.json();
    const rack_name = (body?.rack_name ?? '').trim();
    const rows = Number(body?.rows);
    const cols = Number(body?.cols);

    // バリデーション
    if (!rack_name) {
      return NextResponse.json({ error: 'rack_name is required' }, { status: 400 });
    }
    if (!Number.isInteger(rows) || rows <= 0) {
      return NextResponse.json({ error: 'rows must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(cols) || cols <= 0) {
      return NextResponse.json({ error: 'cols must be a positive integer' }, { status: 400 });
    }

    // INSERT（作成した rack を返す）
    const result = await db.query(
      `INSERT INTO racks (rack_name, rows, cols)
       VALUES ($1, $2, $3)
       RETURNING rack_id, rack_name, rows, cols`,
      [rack_name, rows, cols]
    );

    const created = result.rows[0];

    // 仕様どおりの成功レスポンス
    return NextResponse.json(
      {
        ...created,
        message: '新しいラックが作成されました。'
      },
      { status: 201 }
    );
  } catch (err) {
    // 例: PostgreSQL の一意制約違反 code = '23505'
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'rack_name already exists' }, { status: 409 });
    }
    console.error('[POST /api/racks] DB error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
