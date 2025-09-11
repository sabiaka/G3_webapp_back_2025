import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続

export async function POST(request, { params }) {
  // clientの取得は不要
  try {
    const { rack_id, slot_identifier } = params;
    const { quantity_to_use } = await request.json();

    if (quantity_to_use === undefined || typeof quantity_to_use !== 'number' || quantity_to_use <= 0) {
      return NextResponse.json(
        { message: '使用する個数を正しく指定してください。' },
        { status: 400 }
      );
    }

    // ▼▼▼ トランザクションはdb.queryで直接実行 ▼▼▼
    await db.query('BEGIN');

    // 現在の在庫数を取得
    const getCurrentSlotQuery = `
      SELECT quantity FROM slots
      WHERE rack_id = $1 AND slot_identifier = $2 AND part_name IS NOT NULL;
    `;
    // FOR UPDATEは一部のDB環境でロックが複雑になるため、一度外してシンプルにします
    const currentSlotResult = await db.query(getCurrentSlotQuery, [rack_id, slot_identifier]);

    if (currentSlotResult.rowCount === 0) {
      throw new Error('部品が見つからないか、スロットが空です。');
    }
    
    const currentQuantity = currentSlotResult.rows[0].quantity;

    if (currentQuantity < quantity_to_use) {
      throw new Error(`在庫が不足しています。現在の在庫: ${currentQuantity}個`);
    }

    const remaining_quantity = currentQuantity - quantity_to_use;
    
    let updateQuery;
    let values;

    if (remaining_quantity <= 0) {
      updateQuery = `
        UPDATE slots
        SET part_name = NULL, part_model_number = NULL, quantity = NULL, color_code = NULL
        WHERE rack_id = $1 AND slot_identifier = $2;
      `;
      values = [rack_id, slot_identifier];
    } else {
      updateQuery = `
        UPDATE slots
        SET quantity = $1
        WHERE rack_id = $2 AND slot_identifier = $3;
      `;
      values = [remaining_quantity, rack_id, slot_identifier];
    }
    
    await db.query(updateQuery, values);
    
    await db.query('COMMIT');
    
    return NextResponse.json({
      message: `部品を${quantity_to_use}個使用しました。`,
      remaining_quantity: remaining_quantity
    }, { status: 200 });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('API (Use) エラー:', error.message);

    let status = 500;
    if (error.message.includes('在庫が不足しています')) {
      status = 409;
    } else if (error.message.includes('部品が見つからない')) {
      status = 404;
    }

    return NextResponse.json(
      { message: error.message || 'サーバー内部でエラーが発生しました。' },
      { status: status }
    );
  }
  // finallyとclient.release()も不要
}

