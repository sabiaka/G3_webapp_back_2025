import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 製造指示リストを取得するAPI (GET)
 * @description GET /api/instructions
 * @param request - q, line, is_completed, date(当日一致), start_date/end_date(範囲) による絞り込み検索に対応
 */
export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const line = searchParams.get('line');
    const is_completed = searchParams.get('is_completed');
  const date = searchParams.get('date');       // 作成日（当日一致）
  const start_date = searchParams.get('start_date'); // 作成日（以降）
  const end_date = searchParams.get('end_date');     // 作成日（以前）

    // ベースとなるクエリ
    let query = `
      SELECT
        n.notification_id AS id,
        pl.line_name AS line,
        n.notification_item_name AS product_name,
        n.notification_item_size AS size,
        n.notification_color AS color,
        n.notification_spring_type AS spring_type,
        n.notification_accessories AS included_items,
        n.notification_delivery_method AS shipping_method,
        n.notification_delivery_address AS destination,
        n.notification_remarks AS remarks,
        n.notification_quantity AS quantity,
        n.is_completed,
        n.notification_data_time AS created_at
      FROM
        notifications AS n
      JOIN
        production_lines AS pl ON n.notification_line_id = pl.line_id
    `;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    // ?q=... (フリーワード検索)
    if (q) {
      whereClauses.push(`(
        n.notification_item_name ILIKE $${paramIndex} OR
        n.notification_accessories ILIKE $${paramIndex} OR
        n.notification_delivery_address ILIKE $${paramIndex} OR
        n.notification_remarks ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${q}%`);
      paramIndex++;
    }

    // ?line=... (担当ラインでの絞り込み) - 部分一致に変更
    if (line) {
      whereClauses.push(`pl.line_name ILIKE $${paramIndex}`);
      queryParams.push(`%${line}%`);
      paramIndex++;
    }

    // 日付形式チェック用
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    // ?date=YYYY-MM-DD (当日一致)
    if (date) {
      if (!datePattern.test(date)) {
        return NextResponse.json(
          { message: 'date は YYYY-MM-DD 形式で指定してください。' },
          { status: 400 }
        );
      }
      whereClauses.push(`n.notification_data_time::date = $${paramIndex}`);
      queryParams.push(date);
      paramIndex++;
    } else {
      // ?start_date=YYYY-MM-DD (その日以降)
      if (start_date) {
        if (!datePattern.test(start_date)) {
          return NextResponse.json(
            { message: 'start_date は YYYY-MM-DD 形式で指定してください。' },
            { status: 400 }
          );
        }
        whereClauses.push(`n.notification_data_time::date >= $${paramIndex}`);
        queryParams.push(start_date);
        paramIndex++;
      }
      // ?end_date=YYYY-MM-DD (その日以前)
      if (end_date) {
        if (!datePattern.test(end_date)) {
          return NextResponse.json(
            { message: 'end_date は YYYY-MM-DD 形式で指定してください。' },
            { status: 400 }
          );
        }
        whereClauses.push(`n.notification_data_time::date <= $${paramIndex}`);
        queryParams.push(end_date);
        paramIndex++;
      }
    }

    // ?is_completed=... (完了状態で絞り込み)
    if (is_completed === 'true' || is_completed === 'false') {
      whereClauses.push(`n.is_completed = $${paramIndex}`);
      queryParams.push(is_completed === 'true');
      paramIndex++;
    }

    // WHERE句を組み立て
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    // 新しい指示が上にくるように並び替え
    query += ' ORDER BY n.notification_id DESC';

    const { rows } = await db.query(query, queryParams);

  // console.log('Query:', query, 'Params:', queryParams);

    return NextResponse.json(rows);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 新しい製造指示を登録するAPI (POST)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    // 画像の仕様に合わせてリクエストボディからデータを取得
    const {
      line, // "マット"などのライン名
      product_name,
      size,
      quantity,
      remarks
    } = body;

    // 必須項目のバリデーション
    if (!line || !product_name || quantity === undefined) {
      return NextResponse.json(
        { message: '必須項目（line, product_name, quantity）が不足しています。' },
        { status: 400 }
      );
    }

    // 1. 受け取ったライン名から line_id を検索
    const lineResult = await db.query(
      'SELECT line_id FROM production_lines WHERE line_name = $1',
      [line]
    );

    if (lineResult.rows.length === 0) {
      return NextResponse.json(
        { message: `指定されたライン「${line}」は存在しません。` },
        { status: 400 }
      );
    }
    const line_id = lineResult.rows[0].line_id;
    
    // 2. priority_id はリクエストに含まれないため、デフォルト値を設定
    const defaultPriorityId = 1; // "通常"などを意味するIDを想定
    
    // データベースに新しい指示を挿入するクエリ
    const insertQuery = `
      INSERT INTO notifications (
        notification_line_id,
        notification_priority_id,
        notification_quantity,
        notification_item_name,
        notification_item_size,
        notification_remarks
      ) 
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING notification_id;
    `;
    
    const values = [
      line_id,
      defaultPriorityId,
      quantity,
      product_name,
      size,
      remarks
    ];
    
    const result = await db.query(insertQuery, values);
    const newInstructionId = result.rows[0].notification_id;

    // 成功レスポンス用に、作成されたデータを整形して取得し直す
    const selectQuery = `
      SELECT
        n.notification_id AS id,
        pl.line_name AS line,
        n.notification_item_name AS product_name,
        n.notification_item_size AS size,
        n.notification_color AS color,
        n.notification_spring_type AS spring_type,
        n.notification_accessories AS included_items,
        n.notification_delivery_method AS shipping_method,
        n.notification_delivery_address AS destination,
        n.notification_remarks AS remarks,
        n.notification_quantity AS quantity,
        n.is_completed,
        n.notification_data_time AS created_at
      FROM
        notifications AS n
      JOIN
        production_lines AS pl ON n.notification_line_id = pl.line_id
      WHERE
        n.notification_id = $1;
    `;
    
    const newInstructionResult = await db.query(selectQuery, [newInstructionId]);
    const formattedResponse = newInstructionResult.rows[0];

    return NextResponse.json(formattedResponse, { status: 201 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}