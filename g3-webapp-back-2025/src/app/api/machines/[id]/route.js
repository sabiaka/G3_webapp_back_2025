import { NextResponse } from "next/server";
import db from "@/lib/db"; // ← あなたのDB接続設定に合わせて変更

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const result = await db.query(
      `
      SELECT 
        m.machine_id,
        m.machine_name,
        ms.status,
        ms.today_uptime_seconds,
        ms.today_production_count,
        ms.machine_last_inspection AS last_inspection_date,
        ms.next_inspection_date
      FROM machines m
      LEFT JOIN machine_status ms
        ON m.machine_id = ms.machine_id
      WHERE m.machine_id = $1
      ORDER BY ms.machine_data_time DESC
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    const machine = result.rows[0];

    return NextResponse.json({
      machine_id: machine.machine_id,
      machine_name: machine.machine_name,
      status: machine.status,
      today_uptime_seconds: machine.today_uptime_seconds,
      today_production_count: machine.today_production_count,
      last_inspection_date: machine.last_inspection_date,
      next_inspection_date: machine.next_inspection_date
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
