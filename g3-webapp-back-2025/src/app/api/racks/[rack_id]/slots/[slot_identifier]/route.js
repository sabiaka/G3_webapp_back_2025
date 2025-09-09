import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続

// =================================================================
// POST: 新規格納 or 情報の上書き (Upsert)
// =================================================================
export async function POST(request, { params }) {
  try {
    const { rack_id, slot_identifier } = params;
    const { part_name, part_model_number, quantity, color_code } = await request.json();

    if (!part_name || !part_model_number || quantity === undefined || !color_code) {
      return NextResponse.json(
        { message: '必須項目が不足しています。' },
        { status: 400 }
      );
    }

    const query = `
      INSERT INTO slots (
        rack_id,
        slot_identifier,
        part_name,
        part_model_number,
        quantity,
        color_code
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (rack_id, slot_identifier)
      DO UPDATE SET
        part_name = EXCLUDED.part_name,
        part_model_number = EXCLUDED.part_model_number,
        quantity = EXCLUDED.quantity,
        color_code = EXCLUDED.color_code
      RETURNING *;
    `;

    const values = [
      rack_id,
      slot_identifier,
      part_name,
      part_model_number,
      quantity,
      color_code,
    ];

    const result = await db.query(query, values);
    
    const upsertedSlot = result.rows[0];
    const responseData = {
      message: `スロット ${upsertedSlot.slot_identifier} の部品情報を更新しました。`,
      slot: {
        slot_identifier: upsertedSlot.slot_identifier,
        part_name: upsertedSlot.part_name,
        part_model_number: upsertedSlot.part_model_number,
        quantity: upsertedSlot.quantity,
        color_code: upsertedSlot.color_code,
      }
    };

    return NextResponse.json(responseData, { status: 200 });

  } catch (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { message: '指定された棚（rack_id）が存在しません。' },
        { status: 404 }
      );
    }
    console.error('API (POST) エラー:', error);
    return NextResponse.json(
      { message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}

// =================================================================
// PUT: 既存の部品情報の編集 (Update)
// =================================================================
export async function PUT(request, { params }) {
  try {
    const { rack_id, slot_identifier } = params;
    const { part_name, part_model_number, quantity, color_code } = await request.json();

    if (!part_name || !part_model_number || quantity === undefined || !color_code) {
      return NextResponse.json(
        { message: '必須項目が不足しています。' },
        { status: 400 }
      );
    }

    const query = `
      UPDATE slots
      SET
        part_name = $1,
        part_model_number = $2,
        quantity = $3,
        color_code = $4
      WHERE
        rack_id = $5 AND slot_identifier = $6
      RETURNING *;
    `;

    const values = [
      part_name,
      part_model_number,
      quantity,
      color_code,
      rack_id,
      slot_identifier
    ];

    const result = await db.query(query, values);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '編集対象の棚またはスロットが見つかりません。' },
        { status: 404 }
      );
    }

    const updatedSlot = result.rows[0];
    const responseData = {
      message: `${updatedSlot.slot_identifier}の部品情報を更新しました。`,
      slot: {
        slot_identifier: updatedSlot.slot_identifier,
        part_name: updatedSlot.part_name,
        part_model_number: updatedSlot.part_model_number,
        quantity: updatedSlot.quantity,
        color_code: updatedSlot.color_code,
      }
    };
    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error('API (PUT) エラー:', error);
    return NextResponse.json(
      { message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}

// =================================================================
// DELETE: スロットの部品情報を空にする (NULLでUPDATE)
// =================================================================
export async function DELETE(request, { params }) {
  try {
    // 1. URLからどのスロットかを特定
    const { rack_id, slot_identifier } = params;

    // 2. 部品情報をNULLで更新してスロットを空にするSQLクエリ
    const query = `
      UPDATE slots
      SET
        part_name = NULL,
        part_model_number = NULL,
        quantity = NULL,
        color_code = NULL
      WHERE
        rack_id = $1 AND slot_identifier = $2;
    `;
    const values = [rack_id, slot_identifier];

    // 3. SQLクエリを実行
    const result = await db.query(query, values);

    // 4. 削除（空にする）対象のスロットが見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '削除対象の棚またはスロットが見つかりません。' },
        { status: 404 } // Not Found
      );
    }

    // 5. 仕様書通りの成功レスポンスを返却
    return NextResponse.json(
      { message: `${slot_identifier}の部品を削除しました。` },
      { status: 200 } // OK
    );

  } catch (error) {
    console.error('API (DELETE) エラー:', error);
    return NextResponse.json(
      { message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}

