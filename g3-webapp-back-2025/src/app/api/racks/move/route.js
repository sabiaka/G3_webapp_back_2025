import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続

/**
 * 部品を指定されたスロット間で移動させるAPI
 * 移動先が存在しない場合は自動で作成します。
 * POST /api/racks/move
 */
export async function POST(request) {
  try {
    const {
      from_rack_id,
      from_slot_identifier,
      to_rack_id,
      to_slot_identifier
    } = await request.json();

    if (!from_rack_id || !from_slot_identifier || !to_rack_id || !to_slot_identifier) {
      return NextResponse.json({ message: '必須項目が不足しています。' }, { status: 400 });
    }
    if (from_rack_id === to_rack_id && from_slot_identifier === to_slot_identifier) {
      return NextResponse.json({ message: '移動元と移動先を同じにすることはできません。' }, { status: 400 });
    }
    
    await db.query('BEGIN');

    // 移動元のスロット情報を取得
    const fromSlotQuery = `
      SELECT part_name, part_model_number, quantity, color_code
      FROM slots WHERE rack_id = $1 AND slot_identifier = $2;
    `;
    const fromSlotResult = await db.query(fromSlotQuery, [from_rack_id, from_slot_identifier]);

    if (fromSlotResult.rowCount === 0) throw new Error('移動元のスロットが見つかりません。');
    if (!fromSlotResult.rows[0].part_name) throw new Error('移動元のスロットは空です。');
    const partToMove = fromSlotResult.rows[0];

    // ▼▼▼ ここからが修正箇所 ▼▼▼

    // 移動先スロットの状態を確認
    const toSlotQuery = `SELECT part_name FROM slots WHERE rack_id = $1 AND slot_identifier = $2;`;
    const toSlotResult = await db.query(toSlotQuery, [to_rack_id, to_slot_identifier]);

    // 移動先が存在し、かつ空ではない場合はエラー
    if (toSlotResult.rowCount > 0 && toSlotResult.rows[0].part_name) {
      throw new Error('移動先のスロットには既に別の部品があります。');
    }

    // 移動先スロットが存在するかどうかに応じて、INSERTかUPDATEかを切り替える
    if (toSlotResult.rowCount > 0) {
      // --- ケース1: 移動先が存在する場合 (空なのでUPDATE) ---
      const updateToSlotQuery = `
        UPDATE slots SET part_name = $1, part_model_number = $2, quantity = $3, color_code = $4
        WHERE rack_id = $5 AND slot_identifier = $6;
      `;
      await db.query(updateToSlotQuery, [
        partToMove.part_name, partToMove.part_model_number, partToMove.quantity, partToMove.color_code,
        to_rack_id, to_slot_identifier
      ]);
    } else {
      // --- ケース2: 移動先が存在しない場合 (新しい行をINSERT) ---
      // rack_idが存在しない場合はFOREIGN KEY制約違反となり、catchブロックで処理される
      const insertToSlotQuery = `
        INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
      await db.query(insertToSlotQuery, [
        to_rack_id, to_slot_identifier,
        partToMove.part_name, partToMove.part_model_number, partToMove.quantity, partToMove.color_code
      ]);
    }

    // ▲▲▲ 修正箇所ここまで ▲▲▲

    // 移動元の情報を削除（空にする）
    const clearFromSlotQuery = `
      UPDATE slots SET part_name = NULL, part_model_number = NULL, quantity = NULL, color_code = NULL
      WHERE rack_id = $1 AND slot_identifier = $2;
    `;
    await db.query(clearFromSlotQuery, [from_rack_id, from_slot_identifier]);

    await db.query('COMMIT');

    return NextResponse.json({
      message: `部品を ${from_slot_identifier} から ${to_slot_identifier} へ移動しました。`
    }, { status: 200 });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('API (Move) エラー:', error.message);
    
    let status = 500;
    // FOREIGN KEY制約違反（存在しない棚ID）の場合
    if (error.code === '23503') {
        return NextResponse.json({ message: '移動先の棚（rack_id）が存在しません。' }, { status: 404 });
    }
    if (error.message.includes('見つかりません')) status = 404;
    else if (error.message.includes('空です') || error.message.includes('既に別の部品があります')) status = 409;
    
    return NextResponse.json({ message: error.message || 'サーバー内部でエラーが発生しました。' }, { status: status });
  }
}

