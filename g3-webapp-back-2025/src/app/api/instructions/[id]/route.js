/**
 * ファイルの役割:
 *   製造指示の単一リソースに対する更新・削除API。
 *   パスのIDでレコードを特定し、差分更新または物理削除を行う。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 指定されたIDの製造指示を更新するAPI (PUT)
 * @description PUT /api/instructions/:id
 *
 * 説明:
 *   受け取ったJSONのキー→DBカラムへマッピングして差分UPDATEする。
 *   created_at/notification_data_time の任意更新も許容し、形式を検証する。
 *
 * I/O:
 *   @param {Request} request                                   - JSONボディを含むリクエスト
 *   @param {{ params: { id: string } }} context                - パスパラメータ
 *   @returns {NextResponse}                                     - JSON: 更新後レコード
 *
 * ステータス:
 *   200                                                         - 更新成功
 *   400                                                         - 入力エラー/更新対象なし
 *   404                                                         - 指定IDなし
 *   500                                                         - サーバ内部エラー
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ message: '更新するデータがありません。' }, { status: 400 });
    }
    
    const keyToColumnMap = {
      product_name: 'notification_item_name', size: 'notification_item_size',
      color: 'notification_color', spring_type: 'notification_spring_type',
      included_items: 'notification_accessories', shipping_method: 'notification_delivery_method',
      destination: 'notification_delivery_address', remarks: 'notification_remarks',
      quantity: 'notification_quantity', is_completed: 'is_completed'
    };

    const setClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    // 作成日時の任意更新（created_at または notification_data_time）
    // なぜ: 作成日を後から修正できるようユースケースに対応
    const requestedTimestamp = body.created_at ?? body.notification_data_time ?? null;
    if (requestedTimestamp !== null) {
      const parsed = Date.parse(requestedTimestamp);
      if (isNaN(parsed)) {
        return NextResponse.json(
          { message: '作成日時は ISO 8601（例: 2025-01-02T08:30:00+09:00）または YYYY-MM-DD 形式で指定してください。' },
          { status: 400 }
        );
      }
      setClauses.push(`notification_data_time = $${paramIndex}`);
      queryParams.push(requestedTimestamp);
      paramIndex++;
    }

    for (const key in body) {
      if (keyToColumnMap[key]) {
        setClauses.push(`${keyToColumnMap[key]} = $${paramIndex}`);
        queryParams.push(body[key]);
        paramIndex++;
      }
    }
    
    if (setClauses.length === 0) {
        return NextResponse.json({ message: '更新可能なフィールドが含まれていません。' }, { status: 400 });
    }
    
    queryParams.push(id);

    const updateQuery = `
      UPDATE notifications SET ${setClauses.join(', ')} WHERE notification_id = $${paramIndex}
    `;

    const result = await db.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
        return NextResponse.json({ message: `ID ${id} の指示が見つかりません。` }, { status: 404 });
    }
    
    const selectQuery = `
      SELECT
        n.notification_id AS id, pl.line_name AS line,
        n.notification_item_name AS product_name, n.notification_item_size AS size,
        n.notification_color AS color, n.notification_spring_type AS spring_type,
        n.notification_accessories AS included_items, n.notification_delivery_method AS shipping_method,
        n.notification_delivery_address AS destination, n.notification_remarks AS remarks,
        n.notification_quantity AS quantity, n.is_completed,
        n.notification_data_time AS created_at
      FROM notifications AS n
      JOIN production_lines AS pl ON n.notification_line_id = pl.line_id
      WHERE n.notification_id = $1;
    `;
    
    const updatedInstruction = await db.query(selectQuery, [id]);
    return NextResponse.json(updatedInstruction.rows[0]);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'サーバーでエラーが発生しました。' }, { status: 500 });
  }
}

/**
 * 指定されたIDの製造指示を削除するAPI (DELETE)
 * @description DELETE /api/instructions/:id
 *
 * 説明:
 *   指定IDを物理削除する。存在しない場合は404を返す。
 *
 * I/O:
 *   @param {Request} request                                   - リクエスト
 *   @param {{ params: { id: string } }} context                - パスパラメータ
 *   @returns {NextResponse}                                     - 204 No Content
 *
 * ステータス:
 *   204                                                         - 削除成功
 *   404                                                         - 指定IDなし
 *   500                                                         - サーバ内部エラー
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const deleteQuery = 'DELETE FROM notifications WHERE notification_id = $1';
    const result = await db.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ message: `ID ${id} の指示が見つかりません。` }, { status: 404 });
    }
    
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'サーバーでエラーが発生しました。' }, { status: 500 });
  }
}