// src/app/api/racks/[rack_id]/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db';

// 行ラベル（A, B, C ...）
function rowLabels(n) {
  const labels = [];
  for (let i = 0; i < n; i++) labels.push(String.fromCharCode(65 + i));
  return labels;
}

export async function GET(req, { params }) {
  const rackId = Number(params.rack_id);
  if (!Number.isInteger(rackId)) {
    return NextResponse.json({ error: 'Invalid rack_id' }, { status: 400 });
  }

  try {
    // 1) ラック基本情報
    const rackRes = await db.query(
      'SELECT rack_id, rack_name, rows, cols FROM racks WHERE rack_id = $1',
      [rackId]
    );
    if (rackRes.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const rack = rackRes.rows[0];

    // 2) そのラックのスロット（入ってる所だけ）
    const slotsRes = await db.query(
      `SELECT slot_identifier, part_name, part_model_number, quantity, color_code
         FROM slots
        WHERE rack_id = $1`,
      [rackId]
    );

    // 3) rows×cols の全キーを生成し、未登録は null、登録済はDB値で埋める
    const existing = Object.create(null);
    for (const r of slotsRes.rows) {
      existing[r.slot_identifier] = {
        part_name: r.part_name,
        part_model_number: r.part_model_number,
        quantity: r.quantity,
        color_code: r.color_code, // 例: "#FF5733"
      };
    }

    const labels = rowLabels(rack.rows);
    const slots = {};
    for (const label of labels) {
      for (let c = 1; c <= rack.cols; c++) {
        const key = `${label}-${c}`;
        slots[key] = existing[key] ?? null;
      }
    }

    return NextResponse.json({
      rack_id: rack.rack_id,
      rack_name: rack.rack_name,
      rows: rack.rows,
      cols: rack.cols,
      slots,
    });
  } catch (err) {
    console.error('[GET /api/racks/{rack_id}]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 1マス更新/登録（任意）: PATCH /api/racks/{rack_id}
export async function PATCH(req, { params }) {
  const rackId = Number(params.rack_id);
  if (!Number.isInteger(rackId)) {
    return NextResponse.json({ error: 'Invalid rack_id' }, { status: 400 });
  }

  const body = await req.json();
  const { slot_identifier, part_name, part_model_number, quantity, color_code } = body || {};
  if (!slot_identifier || typeof slot_identifier !== 'string') {
    return NextResponse.json({ error: 'slot_identifier required' }, { status: 400 });
  }

  try {
    // color_code は "#RRGGBB" をそのまま保持（DB側は TEXT でOK）
    // 一意制約: UNIQUE(rack_id, slot_identifier) を想定
    const upsert = await db.query(
      `INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (rack_id, slot_identifier)
       DO UPDATE SET
         part_name = EXCLUDED.part_name,
         part_model_number = EXCLUDED.part_model_number,
         quantity = EXCLUDED.quantity,
         color_code = EXCLUDED.color_code
       RETURNING slot_identifier, part_name, part_model_number, quantity, color_code`,
      [rackId, slot_identifier, part_name ?? null, part_model_number ?? null, quantity ?? null, color_code ?? null]
    );

    return NextResponse.json(upsert.rows[0]);
  } catch (err) {
    console.error('[PATCH /api/racks/{rack_id}]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ★ 追加: ラック削除 DELETE /api/racks/{rack_id}
export async function DELETE(req, { params }) {
  const rackId = Number(params.rack_id);
  if (!Number.isInteger(rackId)) {
    return NextResponse.json({ error: 'Invalid rack_id' }, { status: 400 });
  }

  try {
    // 存在確認 & rack_name 取得
    const rackRes = await db.query(
      'SELECT rack_name FROM racks WHERE rack_id = $1',
      [rackId]
    );
    if (rackRes.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const rackName = rackRes.rows[0].rack_name;

    // トランザクションで削除（CASCADE 無しでも安全）
    await db.query('BEGIN');
    await db.query('DELETE FROM slots WHERE rack_id = $1', [rackId]);
    await db.query('DELETE FROM racks WHERE rack_id = $1', [rackId]);
    await db.query('COMMIT');

    return NextResponse.json({
      message: `ラック「${rackName}」を削除しました。`
    });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch (_) {}
    console.error('[DELETE /api/racks/{rack_id}]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
