/**
 * ファイルの役割:
 *   従業員一覧の取得および新規登録を提供するAPIルート。
 *   Next.js App Router 配下のエンドポイントとして、GET/POST を実装。
 *   DBアクセスは pg のプール経由で生SQL(プレースホルダ)を使用する。
 *
 * 実装ポリシー:
 *   - 入力検証はユーザーに分かりやすい日本語メッセージで400系を返す。
 *   - DBエラー時は詳細はログに残し、レスポンスは汎用500系とする。
 *   - SQLインジェクション対策として必ずパラメータバインド($1, $2, ...)を使用。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';

/**
 * 従業員データを取得するAPI (GET)
 *
 * 説明:
 *   一覧取得API。クエリで受け取った条件に基づき、従業員・役割・ラインを結合して返す。
 *   文字列条件は部分一致(LIKE)で検索し、真偽値の `is_active` のみ完全一致で検索する。
 *
 * I/O:
 *   @param {Request} request                                 - Next.jsのRequestオブジェクト
 *   @returns {NextResponse}                                   - JSON: { employees: Array<EmployeeSummary> }
 *
 * クエリパラメータ:
 *   name_like                                                 - 従業員名の部分一致文字列
 *   is_active                                                 - 有効/無効の完全一致(true/false)
 *   role_name                                                 - 役割名の部分一致文字列
 *   line_name                                                 - ライン名の部分一致文字列
 *   sort                                                      - 並び順('id_asc'|'id_desc')
 *
 * ステータス:
 *   200                                                       - 正常終了
 *   500                                                       - サーバ内部エラー
 */
export async function GET(request) {
  try {
    // ======== クエリ取得と前処理: URLから検索条件を抽出する ========
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    // クエリパラメータとDBカラムのマッピング
    // なぜ: 受け取り名と実カラム名を分離することで、外部インターフェースの安定性を担保するため
    const paramToColumnMap = {
      'name_like': 'e.employee_name',
      'is_active': 'e.employee_is_active',
      'role_name': 'r.role_name',
      'line_name': 'pl.line_name',
    };

    // ======== フィルタ辞書の構築: 値が空でないものだけを対象とする ========
    const filters = {};
    for (const [param, column] of Object.entries(paramToColumnMap)) {
      if (searchParams.has(param)) {
        const value = searchParams.get(param);
        if (value !== null && value !== '') {
          filters[column] = value;
        }
      }
    }

    // ======== ベースSQL: 必要テーブルの結合を確定 ========
    let query = `
      SELECT
        e.employee_id,
        e.employee_name,
        e.employee_user_id,
        e.employee_is_active,
        r.role_name,
        pl.line_name,
        e.employee_special_notes,
        e.employee_color_code
      FROM 
        employees e
      LEFT JOIN 
        roles r ON e.employee_role_id = r.role_id
      LEFT JOIN 
        production_lines pl ON e.employee_line_id = pl.line_id
    `;

    // WHERE句を動的に構築
    // なぜ: 渡された条件のみを使って柔軟に検索するため
    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(filters)) {
      if (column === 'e.employee_is_active') {
        // is_active はブーリアン型なので完全一致(=)で検索
        // なぜ: 真偽値のLIKEは意味がなく、キャストの不一致を避けるため
        whereClauses.push(`${column} = $${paramIndex++}`);
        queryParams.push(value);
      } else {
        // それ以外の文字列カラムは部分一致(LIKE)で検索
        // なぜ: ユーザーが前方/後方/中間一致を意識せず曖昧検索できるようにするため
        whereClauses.push(`${column} LIKE $${paramIndex++}`);
        queryParams.push(`%${value}%`);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // ======== 並び順制御: IDの昇順/降順を選択可能にする ========
    if (sort === 'id_asc') {
      query += ' ORDER BY e.employee_id ASC';
    } else if (sort === 'id_desc') {
      query += ' ORDER BY e.employee_id DESC';
    }

    // ======== 実行: パラメータバインドによりSQLインジェクションを防止 ========
    const result = await db.query(query, queryParams);

    // ======== 整形: クライアント向けのキーにマッピング ========
    const formattedEmployees = result.rows.map(employee => ({
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_user_id: employee.employee_user_id,
      is_active: employee.employee_is_active,
      role_name: employee.role_name,
      line_name: employee.line_name,
      special_notes: employee.employee_special_notes,
      color_code: employee.employee_color_code
    }));

    return NextResponse.json({ employees: formattedEmployees });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}


/**
 * 新しい従業員を登録するAPI (POST)
 *
 * 説明:
 *   必須項目を検証し、パスワードをbcryptでハッシュ化してから登録する。
 *   一意制約/外部キー制約を考慮し、該当時は409/400を返す。
 *
 * I/O:
 *   @param {Request} request                                 - Next.jsのRequestオブジェクト
 *   @returns {NextResponse}                                   - JSON: 登録された従業員の整形データ
 *
 * 受信ボディ(JSON):
 *   employee_name                                            - 従業員名(必須)
 *   employee_user_id                                         - ログイン用ユーザーID(必須, 一意)
 *   password                                                 - 平文パスワード(必須, サーバ側でハッシュ化)
 *   role_id                                                  - 役割ID(必須, 外部キー)
 *   line_id                                                  - ラインID(必須, 外部キー)
 *   color_code                                               - カラーコード(任意)
 *   special_notes                                            - 特記事項(任意)
 *
 * ステータス:
 *   201                                                      - 登録成功
 *   400                                                      - 必須不足/外部キー不正
 *   409                                                      - 一意制約違反(employee_user_id重複)
 *   500                                                      - サーバ内部エラー
 */
export async function POST(request) {
  try {
    // ======== 入力取得 ========
    const body = await request.json();
    
    const { 
      employee_name, 
      employee_user_id, 
      password, 
      role_id,
      line_id,
      color_code, 
      special_notes 
    } = body;

    // ======== 必須チェック: UIのバリデーション漏れにもサーバ側で防波堤を置く ========
    if (!employee_name || !employee_user_id || !password || role_id === undefined || line_id === undefined) {
      return NextResponse.json(
        { message: '必須項目が不足しています。' },
        { status: 400 }
      );
    }
    
    // ======== パスワードハッシュ化: なぜ(平文保存の防止, 既存仕様に準拠) ========
    const hashedPassword = await bcrypt.hash(password, 10); 

    // ======== 登録SQL: RETURNINGで挿入後の行を即時取得 ========
    const query = `
      INSERT INTO employees (
        employee_name, 
        employee_user_id, 
        employee_password,
        employee_role_id, 
        employee_line_id, 
        employee_color_code, 
        employee_special_notes
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    
    const values = [
      employee_name, 
      employee_user_id, 
      hashedPassword,
      role_id,
      line_id,
      color_code, 
      special_notes
    ];
    
    // ======== 実行 ========
    const result = await db.query(query, values);
    const newEmployee = result.rows[0];

    // ======== 整形: クライアントに不要な機密列は含めない ========
    const formattedResponse = {
      employee_id: newEmployee.employee_id,
      employee_name: newEmployee.employee_name,
      employee_user_id: newEmployee.employee_user_id,
      is_active: newEmployee.employee_is_active,
      role_id: newEmployee.employee_role_id,
      line_id: newEmployee.employee_line_id,
      special_notes: newEmployee.employee_special_notes,
      color_code: newEmployee.employee_color_code
    };

    return NextResponse.json(formattedResponse, { status: 201 });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたemployee_user_idは既に使用されています。' },
        { status: 409 }
      );
    }
    if (error.code === '23503') {
      return NextResponse.json(
        { message: '指定された役割(role)またはライン(line)が存在しません。' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}