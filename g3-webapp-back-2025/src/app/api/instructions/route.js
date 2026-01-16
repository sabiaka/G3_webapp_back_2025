/**
 * ファイルの役割:
 *   製造指示の一覧取得と新規登録を提供するAPIルート。
 *   フリーワード・ライン名・完了状態・日付(単日/範囲)での検索に対応し、最新順で返却する。
 *
 * 実装ポリシー:
 *   - 入力検証は日本語メッセージで400系を返す。
 *   - SQLは必ずパラメータバインドを使用して安全性を確保。
 *   - タイムゾーンはサーバ側(JST前提)で ::date により日単位抽出を行う。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 製造指示リストを取得するAPI (GET)
 * @description GET /api/instructions
 *
 * 説明:
 *   フリーワード(q), ライン名(line), 完了状態(is_completed), 単日(date) または 範囲(start_date/end_date) で検索できる。
 *   date が指定された場合はそれを優先し、なければ start/end の範囲条件を適用する。
 *
 * I/O:
 *   @param {Request} request                                   - クエリ付きリクエスト
 *   @returns {NextResponse}                                     - JSON: 製造指示配列
 *
 * クエリ:
 *   q                                                           - フリーワード(名称/付属品/宛先/備考を部分一致)
 *   line                                                        - ライン名(部分一致)
 *   is_completed                                                - 'true'|'false'
 *   date                                                        - 'YYYY-MM-DD' (単日一致)
 *   start_date                                                  - 'YYYY-MM-DD' (以降)
 *   end_date                                                    - 'YYYY-MM-DD' (以前)
 *
 * ステータス:
 *   200                                                         - 成功
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー
 */
export async function GET(request) {
  try {
    // ======== クエリ取得: 条件を個別に取り出す ========
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const line = searchParams.get('line');
    const is_completed = searchParams.get('is_completed');
  const date = searchParams.get('date');       // 作成日（当日一致）
  const start_date = searchParams.get('start_date'); // 作成日（以降）
  const end_date = searchParams.get('end_date');     // 作成日（以前）

    // ベースとなるクエリ
    // なぜ: 表示に必要な列を別名で整形し、JOINでライン名を取得するため
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
    // なぜ: ユーザーが厳密一致を知らなくても曖昧検索できるようにするため
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
      // なぜ: ::date でサーバ側タイムゾーンに正規化し、日単位で一致させるため
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
        // なぜ: 範囲検索でも日単位扱いとするため ::date を使用
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
        // なぜ: 範囲検索でも日単位扱いとするため ::date を使用
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
 *
 * 説明:
 *   ライン名からline_idを解決し、任意の作成日時を許容して挿入する。
 *   作成後はJOINで整形した1件を返す。
 *
 * I/O:
 *   @param {Request} request                                   - JSONボディを含むリクエスト
 *   @returns {NextResponse}                                     - JSON: 登録レコード
 *
 * 受信ボディ(JSON):
 *   line                                                        - ライン名(必須)
 *   product_name                                                - 品名(必須)
 *   size                                                        - 規格(任意)
 *   quantity                                                    - 数量(必須)
 *   remarks                                                     - 備考(任意)
 *   created_at|notification_data_time                           - 任意の作成日時(ISO8601|YYYY-MM-DD)
 *
 * ステータス:
 *   201                                                         - 作成成功
 *   400                                                         - 入力エラー
 *   500                                                         - サーバ内部エラー
 */
export async function POST(request) {
  try {
    // ======== 入力取得 ========
    const body = await request.json();
    
    // 画像の仕様に合わせてリクエストボディからデータを取得
    const {
      line, // "マット"などのライン名
      product_name,
      size,
      quantity,
      remarks,
      // 任意指定の作成日時（どちらかのキーを受け付ける）
      created_at,
      notification_data_time
    } = body;

    // 必須項目のバリデーション
    if (!line || !product_name || quantity === undefined) {
      return NextResponse.json(
        { message: '必須項目（line, product_name, quantity）が不足しています。' },
        { status: 400 }
      );
    }

    // 1. 受け取ったライン名から line_id を検索
    // なぜ: APIではline名で受け取り、DBはIDで管理しているため
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
    
    // 3. 作成日時（notification_data_time）の任意指定を処理
    //    - created_at もしくは notification_data_time のどちらかが与えられていればそれを利用
    //    - 未指定ならDBのデフォルト（現在時刻）に任せる
    const requestedTimestamp = created_at ?? notification_data_time ?? null;
    if (requestedTimestamp !== null) {
      // 簡易フォーマットチェック（ISO8601推奨、YYYY-MM-DD も許可）
      // Date.parse による検証（NaNでなければ受け付け）
      const parsed = Date.parse(requestedTimestamp);
      if (isNaN(parsed)) {
        return NextResponse.json(
          { message: '作成日時は ISO 8601（例: 2025-01-02T08:30:00+09:00）または YYYY-MM-DD 形式で指定してください。' },
          { status: 400 }
        );
      }
    }
    
    // データベースに新しい指示を挿入するクエリ（作成日時の有無で分岐）
    let insertQuery;
    let values;
    if (requestedTimestamp !== null) {
      insertQuery = `
        INSERT INTO notifications (
          notification_line_id,
          notification_priority_id,
          notification_quantity,
          notification_item_name,
          notification_item_size,
          notification_remarks,
          notification_data_time
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING notification_id;
      `;
      values = [
        line_id,
        defaultPriorityId,
        quantity,
        product_name,
        size,
        remarks,
        requestedTimestamp
      ];
    } else {
      insertQuery = `
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
      values = [
        line_id,
        defaultPriorityId,
        quantity,
        product_name,
        size,
        remarks
      ];
    }
    
    const result = await db.query(insertQuery, values);
    const newInstructionId = result.rows[0].notification_id;

    // 成功レスポンス用に、作成されたデータを整形して取得し直す
    // なぜ: 返却形式を一覧と同一にしてクライアント側の取り回しを統一するため
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