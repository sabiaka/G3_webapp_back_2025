/**
 * ファイル概要
 * ==========
 * このファイルは 特定IDの日報の取得・更新・削除 を行うAPIを提供します。
 * 取得はJOINで従業員名・ライン名も返し、更新/削除は標準的なバリデーションとエラーハンドリングに従います。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // 既存のDB接続をインポート

/**
 * 1. 特定の日報取得 (GET /api/reports/{id})
 * @description 従業員APIのGET(一覧)のSELECTクエリを参考に、単一IDで取得
 *
 * 引数（Path Params）
 * - id : 数値（必須）
 *
 * 成功時の戻り値（200）
 * - { report_id, employee_id, employee_name, line_id, line_name, report_date, notes, updated_at }
 *
 * エラー
 * - 400 IDが無効です。
 * - 404 日報が見つかりません。
 * - 500 サーバーエラー。
 */
export async function GET(request, context) {
  const { id } = await context.params;
  
  try {
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) {
      return NextResponse.json({ message: 'IDが無効です。' }, { status: 400 });
    }

    // GET(一覧)と同様に、JOINして名前も取得する
    const query = `
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
      WHERE 
        dr.report_id = $1;
    `;
    
    const result = await db.query(query, [reportId]);

    // 従業員APIには[id]のGETがないため、404処理は設計書に基づき実装
    if (result.rows.length === 0) {
      return NextResponse.json(
        { message: "日報が見つかりません" }, // 設計書の文言
        { status: 404 }
      );
    }

    // 1件のデータをそのまま返す
    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}


/**
 * 2. 特定の日報を更新するAPI (PUT /api/reports/{id})
 * @description 従業員APIのPOSTのロジックを参考にUPDATEを実装
 *
 * リクエストボディ（JSON）
 * - employee_id : 数値（必須）
 * - line_id     : 数値（必須）
 * - report_date : 文字列 'YYYY-MM-DD'（必須）
 * - notes       : 文字列 | null
 *
 * 成功時の戻り値（200）
 * - report_id, employee_id, line_id, report_date, notes, created_at, updated_at
 *
 * エラー
 * - 400 入力不足/ID無効          : 必須項目不足やID不正。
 * - 400 FK制約違反               : 指定従業員/ラインが存在しない（23503）。
 * - 404 更新対象なし             : 対象IDが存在しない。
 * - 500 サーバーエラー           : DBアクセス等で異常。
 */
export async function PUT(request, context) {
  const { id } = await context.params;

  try {
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) {
      return NextResponse.json({ message: 'IDが無効です。' }, { status: 400 });
    }
    
    const body = await request.json();
    const { 
      employee_id,
      line_id,
      report_date,
      notes
    } = body;

    // 必須項目チェック
    if (employee_id === undefined || line_id === undefined || !report_date) {
      return NextResponse.json(
        { message: '必須項目 (employee_id, line_id, report_date) が不足しています。' },
        { status: 400 }
      );
    }
    
    const query = `
      UPDATE daily_reports SET
        employee_id = $1,
        line_id = $2,
        report_date = $3,
        notes = $4,
        updated_at = NOW()
      WHERE
        report_id = $5
      RETURNING *;
    `;
    
    const values = [
      employee_id, 
      line_id, 
      report_date,
      notes || null,
      reportId
    ];
    
    const result = await db.query(query, values);
    
    // 更新対象のIDが存在しなかった場合
    if (result.rows.length === 0) {
       return NextResponse.json(
        { message: '更新対象の日報が見つかりません' },
        { status: 404 }
      );
    }

    const updatedReport = result.rows[0];
    
    // 従業員APIのPOSTのレスポンス形式に合わせる (JOINなし)
    const formattedResponse = {
      report_id: updatedReport.report_id,
      employee_id: updatedReport.employee_id,
      line_id: updatedReport.line_id,
      report_date: updatedReport.report_date,
      notes: updatedReport.notes,
      created_at: updatedReport.created_at,
      updated_at: updatedReport.updated_at
    };

    return NextResponse.json(formattedResponse, { status: 200 }); // 更新は200 OK

  } catch (error) {
    console.error('DBエラー発生！:', error);
    
    // 従業員APIのPOSTのエラーハンドリング (FK制約)
    if (error.code === '23503') {
      return NextResponse.json(
        { message: '指定された従業員(employee_id)またはライン(line_id)が存在しません。' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}


/**
 * 3. 特定の日報を削除するAPI (DELETE /api/reports/{id})
 * @description 従業員APIにないため、標準的なDELETE処理を実装
 *
 * 成功時の戻り値（204）
 * - 本文なし。
 *
 * エラー
 * - 400 IDが無効です。
 * - 404 削除対象が見つからない。
 * - 500 サーバーエラー。
 */
export async function DELETE(request, context) {
  const { id } = await context.params;

  try {
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) {
      return NextResponse.json({ message: 'IDが無効です。' }, { status: 400 });
    }

    const query = 'DELETE FROM daily_reports WHERE report_id = $1';
    const result = await db.query(query, [reportId]);

    // 削除された行が0行の場合 (対象のIDが存在しなかった)
    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '削除対象の日報が見つかりません' },
        { status: 404 }
      );
    }

    // 成功時 (設計書通り 204 No Content を返す)
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}