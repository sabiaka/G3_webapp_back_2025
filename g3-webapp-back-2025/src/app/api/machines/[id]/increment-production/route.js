import { NextResponse } from "next/server";
import db from "@/lib/db";

// 生産数インクリメント API
// POST /api/machines/{id}/increment-production
export async function POST(request, ctx) {
    const { id } = await ctx.params; // Next.js 15: params は非同期

    try {
        // 1) 機械の存在確認（ID は数値ID or 機械名 のどちらでも可）
        const isNumericId = /^\d+$/.test(String(id));
        let machineId;
        if (isNumericId) {
            const res = await db.query(
                "SELECT machine_id FROM machines WHERE machine_id = $1",
                [parseInt(id, 10)]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "Machine not found" }, { status: 404 });
            }
            machineId = res.rows[0].machine_id;
        } else {
            const res = await db.query(
                "SELECT machine_id FROM machines WHERE machine_name = $1",
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "Machine not found" }, { status: 404 });
            }
            machineId = res.rows[0].machine_id;
        }

        // 2) 直近のステータス行取得（status には依存せず、machine_start_time の有無で稼働中を判定）
        const latestRes = await db.query(
            `
        SELECT machine_status_id, machine_start_time, today_production_count, machine_data_time
        FROM machine_status
        WHERE machine_id = $1
        ORDER BY machine_data_time DESC
        LIMIT 1
      `,
            [machineId]
        );

        if (latestRes.rows.length === 0 || !latestRes.rows[0].machine_start_time) {
            return NextResponse.json(
                { error: "Machine is not running" },
                { status: 409 }
            );
        }

        const latest = latestRes.rows[0];
        const { machine_status_id, machine_start_time, machine_data_time } = latest;

        // 3) JSTで日付ロール判定
        const dateRes = await db.query(
            `
          SELECT 
            (now() AT TIME ZONE 'Asia/Tokyo')::date AS today_jst,
            ($1::timestamp AT TIME ZONE 'Asia/Tokyo')::date AS row_date
        `,
            [machine_data_time]
        );
        const todayJst = dateRes.rows[0].today_jst;
        const rowDate = dateRes.rows[0].row_date;

        if (String(todayJst) !== String(rowDate)) {
            // 日付が変わっていたら、新規行を作成して 1 から開始
            let insertRes;
            try {
                insertRes = await db.query(
                    `
                  INSERT INTO machine_status (machine_id, status, machine_start_time, today_production_count)
                  VALUES ($1, '稼働中', $2, 1)
                  RETURNING today_production_count
                `,
                    [machineId, machine_start_time]
                );
            } catch (e) {
                if (e && e.code === '42703') { // status 列がない場合
                    insertRes = await db.query(
                        `
                      INSERT INTO machine_status (machine_id, machine_start_time, today_production_count)
                      VALUES ($1, $2, 1)
                      RETURNING today_production_count
                    `,
                        [machineId, machine_start_time]
                    );
                } else {
                    throw e;
                }
            }

            return NextResponse.json({
                today_production_count: insertRes.rows[0].today_production_count,
            });
        } else {
            // 同日中なら原子的に +1
            const updateRes = await db.query(
                `
              UPDATE machine_status
              SET today_production_count = COALESCE(today_production_count, 0) + 1
              WHERE machine_status_id = $1
              RETURNING today_production_count
            `,
                [machine_status_id]
            );

            return NextResponse.json({
                today_production_count: updateRes.rows[0].today_production_count,
            });
        }
    } catch (err) {
        console.error("API Error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
