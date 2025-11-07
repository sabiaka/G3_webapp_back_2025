import { NextResponse } from 'next/server';
import db from '@/lib/db'; // 従業員APIと同じdbインスタンスをインポート

/**
 * 1. 日報一覧取得 (GET)
 * @description 従業員APIのGETリクエストの構成に準拠
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // クエリパラメータとDBカラムのマッピング (設計書 + 従業員APIの形式)
    const paramToColumnMap = {
      'employee_name': 'e.employee_name', // 従業員API参考 (部分一致)
      'line_name': 'pl.line_name',      // 従業員API参考 (部分一致)
      'start_date': 'dr.report_date',     // 日報API設計 (>=)
      'end_date': 'dr.report_date',       // 日報API設計 (<=)
    };

    const filters = {};
    for (const [param, column] of Object.entries(paramToColumnMap)) {
      if (searchParams.has(param)) {
        const value = searchParams.get(param);
        if (value !== null && value !== '') {
          filters[column] = value;
        }
      }
    }

    // ベースとなるSELECTクエリ (JOINを含む)
    let query = `
      SELECT
        dr.report_id,
        dr.employee_id,
        e.employee_name,
        dr.line_id,
        pl.line_name,
        TO_CHAR(dr.report_date, 'YYYY-MM-DD') AS report_date,
        dr.notes,
        dr.updated_at
      FROM 
        daily_reports dr
      LEFT JOIN 
        employees e ON dr.employee_id = e.employee_id
      LEFT JOIN 
        production_lines pl ON dr.line_id = pl.line_id
    `;

    // WHERE句を動的に構築 (従業員APIのロジックを流用)
    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(filters)) {
      if (column === 'e.employee_name' || column === 'pl.line_name') {
        // 文字列カラムは部分一致(LIKE)で検索
        whereClauses.push(`${column} LIKE $${paramIndex++}`);
        queryParams.push(`%${value}%`);
      } else if (column === 'dr.report_date') {
        // 日付の処理 (start_date と end_date で同じカラム名が渡される)
        if (searchParams.has('start_date') && value === searchParams.get('start_date')) {
            whereClauses.push(`${column} >= $${paramIndex++}`);
            queryParams.push(value);
        }
        if (searchParams.has('end_date') && value === searchParams.get('end_date')) {
            whereClauses.push(`${column} <= $${paramIndex++}`);
            queryParams.push(value);
        }
      }
    }
    
    // NOTE: start_date/end_dateのロジックが重複しないよう調整
    const uniqueWhereClauses = [...new Set(whereClauses)];

    if (uniqueWhereClauses.length > 0) {
      query += ` WHERE ${uniqueWhereClauses.join(' AND ')}`;
    }

    // デフォルトの並び順 (日付が新しい順)
    query += ' ORDER BY dr.report_date DESC, dr.report_id DESC';

    const result = await db.query(query, queryParams);

    // 従業員APIの "formattedEmployees" に相当する処理
    // (JOIN済みなので、そのまま .rows を使う)
    const formattedReports = result.rows;

    // 従業員APIの `{ employees: ... }` の形式に合わせて返す
    return NextResponse.json({ reports: formattedReports });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}


/**
 * 2. 新しい日報を登録するAPI (POST)
 * @description 従業員APIのPOSTリクエストの構成に準拠
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    const { 
      employee_id,
      line_id,
      report_date,
      notes
    } = body;

    // 必須項目チェック (従業員API参考)
    if (employee_id === undefined || line_id === undefined || !report_date) {
      return NextResponse.json(
        { message: '必須項目 (employee_id, line_id, report_date) が不足しています。' },
        { status: 400 }
      );
    }
    
    // (bcryptによるハッシュ化は日報にないためスキップ)

    const query = `
      INSERT INTO daily_reports (
        employee_id, 
        line_id, 
        report_date,
        notes,
        updated_at
      ) 
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *;
    `;
    
    const values = [
      employee_id, 
      line_id, 
      report_date,
      notes || null
    ];
    
    const result = await db.query(query, values);
    const newReport = result.rows[0];

    // 従業員APIの "formattedResponse" に合わせる
    // (JOINなしの、INSERT結果の生データを返す)
    const formattedResponse = {
      report_id: newReport.report_id,
      employee_id: newReport.employee_id,
      line_id: newReport.line_id,
      report_date: newReport.report_date, // (注: TO_CHAR適用前のDateオブジェクト)
      notes: newReport.notes,
      created_at: newReport.created_at,
      updated_at: newReport.updated_at
    };

    return NextResponse.json(formattedResponse, { status: 201 });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    
    // 従業員APIのエラーコード (23503: FK制約違反)
    if (error.code === '23503') {
      return NextResponse.json(
        { message: '指定された従業員(employee_id)またはライン(line_id)が存在しません。' },
        { status: 400 }
      );
    }
    
    // (23505: UNIQUE制約違反は日報テーブルにないためスキップ)

    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}