import { NextResponse } from "next/server";
import db from "@/lib/db"; // DB接続

export async function GET(request, ctx) {
  // Next.js 15+: params は Promise
  const { id } = await ctx.params;

  try {
    // IDは数値IDまたは機械名の両対応
    const isNumericId = /^\d+$/.test(String(id));
    let machineId;
    if (isNumericId) {
      const res = await db.query(
        "SELECT machine_id, machine_name FROM machines WHERE machine_id = $1",
        [parseInt(id, 10)]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ error: "Machine not found" }, { status: 404 });
      }
      machineId = res.rows[0].machine_id;
    } else {
      const res = await db.query(
        "SELECT machine_id, machine_name FROM machines WHERE machine_name = $1",
        [id]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ error: "Machine not found" }, { status: 404 });
      }
      machineId = res.rows[0].machine_id;
    }

    // 最新のステータス1行を取得しつつ、必要な値を算出（uptime/next_inspection_date）
    const result = await db.query(
      `
      WITH jst AS (
        SELECT (now() AT TIME ZONE 'Asia/Tokyo') AS now_jst
      )
      SELECT 
        m.machine_id,
        m.machine_name,
        -- 当日稼働秒数（JST日付が同じ場合のみ now - start を秒で）
        CASE 
          WHEN ms.machine_start_time IS NULL THEN 0
          WHEN ((ms.machine_data_time AT TIME ZONE 'Asia/Tokyo')::date = (SELECT now_jst::date FROM jst))
            THEN GREATEST(0, EXTRACT(EPOCH FROM ((SELECT now_jst FROM jst) - ms.machine_start_time))::int)
          ELSE 0
        END AS today_uptime_seconds,
        COALESCE(ms.today_production_count, 0) AS today_production_count,
        ms.machine_last_inspection AS last_inspection_date,
        CASE 
          WHEN ms.machine_last_inspection IS NOT NULL AND ms.inspection_interval_days IS NOT NULL
            THEN (ms.machine_last_inspection + ms.inspection_interval_days)::date
          ELSE NULL
        END AS next_inspection_date
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT *
        FROM machine_status s
        WHERE s.machine_id = m.machine_id
        ORDER BY s.machine_data_time DESC
        LIMIT 1
      ) ms ON TRUE
      WHERE m.machine_id = $1
      `,
      [machineId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    const machine = result.rows[0];

    return NextResponse.json({
      machine_id: machine.machine_id,
      machine_name: machine.machine_name,
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
