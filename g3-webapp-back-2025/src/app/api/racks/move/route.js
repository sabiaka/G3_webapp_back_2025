import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続

/**
 * 部品を指定されたスロット間で移動させるAPI
 * 移動先が存在しない場合は自動で作成します。
 * POST /api/racks/move
 */
export async function POST(request) {
  try {
    /**
     * ファイル概要
     * ==========
     * このファイルは 部品のスロット間移動 を行うAPIを提供します。
     * 移動先が存在しない場合は新規作成、存在するが空でない場合は409を返して安全に運用します。
     * 処理はトランザクションで一括整合性を担保します。
     */
    const {
      from_rack_id,
      from_slot_identifier,
      to_rack_id,
      to_slot_identifier
    } = await request.json();

    /**
     * リクエストボディ（JSON）
     * - from_rack_id        : 数値または文字列
     * - from_slot_identifier: 文字列
     * - to_rack_id          : 数値または文字列
     * - to_slot_identifier  : 文字列
     *
     * 成功時の戻り値（200）
     * - message : 文字列。移動完了メッセージ。
     *
     * エラー
     * - 400 入力不正・同一指定      : 必須項目不足、または移動元と移動先が同一。
     * - 404 未存在                  : 移動元ラック/スロットが存在しない等。
     * - 409 競合                    : 移動先に既に部品がある。
     * - 500 サーバーエラー          : DB/トランザクションエラー等。
     *
     * 実装方針の要点
     * - トランザクションで取得→検証→移動先更新/挿入→移動元削除を一括実行。
     */
    // 必須項目のバリデーション
    if (!from_rack_id || !from_slot_identifier || !to_rack_id || !to_slot_identifier) {
      return NextResponse.json({ message: '必須項目が不足しています。' }, { status: 400 });
    }
    // 移動元と移動先が同じでないかチェック
    if (from_rack_id === to_rack_id && from_slot_identifier === to_slot_identifier) {
      return NextResponse.json({ message: '移動元と移動先を同じにすることはできません。' }, { status: 400 });
    }
    
    // トランザクション開始
    await db.query('BEGIN');

    // 1. 移動元のスロット情報を取得
    const fromSlotQuery = `
      SELECT part_name, part_model_number, quantity, color_code
      FROM slots WHERE rack_id = $1 AND slot_identifier = $2;
    `;
    const fromSlotResult = await db.query(fromSlotQuery, [from_rack_id, from_slot_identifier]);

    // 移動元スロットの存在と中身をチェック
    if (fromSlotResult.rowCount === 0) {
      throw new Error('移動元のスロットが見つかりません。');
    }
    if (!fromSlotResult.rows[0].part_name) {
      throw new Error('移動元のスロットは空です。');
    }
    const partToMove = fromSlotResult.rows[0];

    // 2. 移動先スロットの状態を確認
    const toSlotQuery = `SELECT part_name FROM slots WHERE rack_id = $1 AND slot_identifier = $2;`;
    const toSlotResult = await db.query(toSlotQuery, [to_rack_id, to_slot_identifier]);

    // 移動先に既に部品がある場合はエラー
    if (toSlotResult.rowCount > 0 && toSlotResult.rows[0].part_name) {
      throw new Error('移動先のスロットには既に別の部品があります。');
    }

    // 3. 移動先のデータを更新または挿入
    if (toSlotResult.rowCount > 0) {
      // ケース1: 移動先スロットが存在する場合 (空なのでUPDATE)
      const updateToSlotQuery = `
        UPDATE slots SET part_name = $1, part_model_number = $2, quantity = $3, color_code = $4
        WHERE rack_id = $5 AND slot_identifier = $6;
      `;
      await db.query(updateToSlotQuery, [
        partToMove.part_name, partToMove.part_model_number, partToMove.quantity, partToMove.color_code,
        to_rack_id, to_slot_identifier
      ]);
    } else {
      // ケース2: 移動先スロットが存在しない場合 (新しい行をINSERT)
      const insertToSlotQuery = `
        INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
      await db.query(insertToSlotQuery, [
        to_rack_id, to_slot_identifier,
        partToMove.part_name, partToMove.part_model_number, partToMove.quantity, partToMove.color_code
      ]);
    }

    // 4. 移動元のスロットを完全に削除
    const deleteFromSlotQuery = `
      DELETE FROM slots
      WHERE rack_id = $1 AND slot_identifier = $2;
    `;
    await db.query(deleteFromSlotQuery, [from_rack_id, from_slot_identifier]);
    
    // トランザクションをコミット
    await db.query('COMMIT');

    // 5. 成功レスポンスを返す
    return NextResponse.json({
      message: `部品を ${from_slot_identifier} から ${to_slot_identifier} へ移動しました。`
    }, { status: 200 });

  } catch (error) {
    // エラーが発生した場合はロールバック
    await db.query('ROLLBACK');
    console.error('API (Move) エラー:', error.message);
    
    let message = 'サーバー内部でエラーが発生しました。';
    let status = 500;
    
    // FOREIGN KEY制約違反（存在しない棚ID）の場合
    if (error.code === '23503') {
        message = '移動先の棚（rack_id）が存在しません。';
        status = 404;
    }
    // エラーメッセージに応じてステータスコードを振り分ける
    else if (error.message.includes('見つかりません')) {
      message = error.message;
      status = 404;
    }
    else if (error.message.includes('空です') || error.message.includes('既に別の部品があります')) {
      message = error.message;
      status = 409; // Conflict
    }
    
    return NextResponse.json({ message: message }, { status: status });
  }
}