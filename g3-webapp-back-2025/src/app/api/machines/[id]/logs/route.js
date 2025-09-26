import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request, ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date");
  const type = searchParams.get("type");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const offset = (page - 1) * limit;

  try {
    const whereClauses = ["machine_id = $1"];
    const values = [id];
    let index = 2;

    if (date) {
      // JST基準で日付比較（Asia/Tokyo）
      whereClauses.push(`(timestamp AT TIME ZONE 'Asia/Tokyo')::date = $${index++}`);
      values.push(date);
    }

    if (type) {
      whereClauses.push(`log_type = $${index++}`);
      values.push(type);
    }

    const whereSQL = whereClauses.join(" AND ");

    // 件数カウント
    const countResult = await db.query(
      `SELECT COUNT(*) FROM machine_logs WHERE ${whereSQL}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    // データ取得
    const logsResult = await db.query(
      `
      SELECT log_id, timestamp, log_type, title, message
      FROM machine_logs
      WHERE ${whereSQL}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
      `,
      values
    );

    return NextResponse.json({
      total_pages: totalPages,
      current_page: page,
      logs: logsResult.rows
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
