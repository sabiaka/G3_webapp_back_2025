/**
 * ファイル概要
 * ==========
 * このファイルは 機械ログのページング取得 API を提供します。
 * 画面の日付/種別/ユニットIDで絞り込み、JST日付ベースでの抽出とします。
 */
import { NextResponse } from "next/server";
import db from "@/lib/db";

const ALLOWED_TYPES = ["error", "warning", "info"];

/**
 * GET /api/machines/{id}/logs
 * --------------------------------------
 * 指定機械のログをページングで返却します。idは数値IDまたは機械名のいずれも可。
 *
 * 引数（Path Params）
 * - id            : 数値の machine_id または文字列の machine_name
 *
 * 引数（Query Params）
 * - date          : 文字列 'YYYY-MM-DD'。JST日付で一致抽出。
 * - type          : 'error' | 'warning' | 'info'。
 * - unit_id       : 数値。ユニットID。
 * - page          : 数値（>=1）。省略時 1。
 * - limit         : 数値（>=1）。省略時 20。
 *
 * 成功時の戻り値（200）
 * - total_pages   : 数値。総ページ数。
 * - current_page  : 数値。現在ページ。
 * - logs          : 配列。{ log_id, unit_id, timestamp, log_type, title, message } の配列。
 *
 * エラー
 * - 400 入力不正                 : typeが不正、またはunit_idが数値でない。
 * - 500 Internal Server Error   : 予期せぬエラー。
 *
 * 実装方針の要点
 * - idが数値かどうかでmachinesテーブルJOINの有無を切替（名前指定にも対応）。
 * - JST基準の日付抽出は (timestamp AT TIME ZONE 'Asia/Tokyo')::date を使用。
 * - LIMIT/OFFSETもプレースホルダ化し、SQLインジェクションを防止。
 */
export async function GET(request, ctx) {
  const { id } = await ctx.params; // Next.js 15: params は非同期
  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date"); // 'YYYY-MM-DD'
  const type = searchParams.get("type"); // 'error' | 'warning' | 'info'
  const unitIdParam = searchParams.get("unit_id"); // 数値
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
  const offset = (page - 1) * limit;

  // 入力検証
  if (type && !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "type は error / warning / info のいずれかを指定してください。" },
      { status: 400 }
    );
  }

  const unitId = unitIdParam !== null ? parseInt(unitIdParam, 10) : null;
  if (unitIdParam !== null && Number.isNaN(unitId)) {
    return NextResponse.json(
      { error: "unit_id は数値で指定してください。" },
      { status: 400 }
    );
  }

  try {
    const values = [];
    const whereClauses = [];
    let index = 1;

    // id が数値なら machine_id で絞り込み、そうでなければ machine_name で絞り込み
    const isNumericId = /^\d+$/.test(String(id));
    let fromSQL = "machine_logs ml";
    if (isNumericId) {
      fromSQL = "machine_logs ml JOIN machines m ON m.machine_name = ml.machine_name";
      whereClauses.push(`m.machine_id = $${index++}`);
      values.push(parseInt(id, 10));
    } else {
      whereClauses.push(`ml.machine_name = $${index++}`);
      values.push(id);
    }

    if (date) {
      // JST 基準で日付比較（Asia/Tokyo）
      whereClauses.push(`(ml.timestamp AT TIME ZONE 'Asia/Tokyo')::date = $${index++}`);
      values.push(date);
    }

    if (type) {
      whereClauses.push(`ml.log_type = $${index++}`);
      values.push(type);
    }

    if (unitIdParam !== null) {
      whereClauses.push(`ml.unit_id = $${index++}`);
      values.push(unitId);
    }

    const whereSQL = whereClauses.join(" AND ");

    // 件数カウント
    const countResult = await db.query(
      `SELECT COUNT(*) FROM ${fromSQL} WHERE ${whereSQL}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    // データ取得（LIMIT/OFFSET もプレースホルダー化）
    const limitIndex = index++;
    const offsetIndex = index++;
    const logsResult = await db.query(
      `
        SELECT
          ml.log_id,
          ml.unit_id,
          ml.timestamp,
          ml.log_type,
          ml.title,
          ml.message
        FROM ${fromSQL}
        WHERE ${whereSQL}
        ORDER BY ml.timestamp DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      total_pages: totalPages,
      current_page: page,
      logs: logsResult.rows
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: "内部サーバーエラー" },
      { status: 500 }
    );
  }
}
