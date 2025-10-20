import { NextResponse } from "next/server";
import db from "@/lib/db";

// 点検の完了 API
// POST /api/machines/{id}/complete-inspection
export async function POST(request, ctx) {
    const { id } = await ctx.params; // Next.js 15: params は非同期

    try {
        // 1) 機械の存在確認（数値ID or 機械名）
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

        // 2) 最新レコード取得
                const latestRes = await db.query(
                        `
                SELECT machine_status_id, machine_last_inspection
                FROM machine_status
                WHERE machine_id = $1
                ORDER BY machine_data_time DESC
                LIMIT 1
            `,
                        [machineId]
                );

        // 列存在チェック（テーブルに1行もない場合を考慮して別途確認）
                const colCheck = await db.query(
                        `
                SELECT 
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machine_status' AND column_name='inspection_interval_days') AS has_interval,
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machine_status' AND column_name='next_inspection_date') AS has_next_date
            `
                );
        const hasInterval = !!colCheck.rows[0]?.has_interval;
        const hasNextDate = !!colCheck.rows[0]?.has_next_date;

        let row;
        if (latestRes.rows.length > 0) {
            const latest = latestRes.rows[0];
            const { machine_status_id } = latest;

            if (hasInterval) {
                // 新スキーマ: interval を使って次回日付は算出のみ（列は持たない想定）
                const updateRes = await db.query(
                    `
            UPDATE machine_status
            SET machine_last_inspection = CURRENT_DATE
            WHERE machine_status_id = $1
            RETURNING 
              machine_id,
              machine_last_inspection::date AS last_inspection_date,
              (machine_last_inspection + inspection_interval_days)::date AS next_inspection_date
          `,
                    [machine_status_id]
                );
                row = updateRes.rows[0];
            } else if (hasNextDate) {
                // 旧スキーマ: next_inspection_date を直接更新
                // 既存の周期が推定できれば維持（前回 next - last の日数）。不明なら 90日。
                const updateRes = await db.query(
                    `
            WITH base AS (
              SELECT 
                GREATEST(1, COALESCE((next_inspection_date - machine_last_inspection), 90))::int AS delta
              FROM machine_status WHERE machine_status_id = $1
            )
            UPDATE machine_status ms
            SET machine_last_inspection = CURRENT_DATE,
                next_inspection_date = CURRENT_DATE + (SELECT delta FROM base)
            WHERE machine_status_id = $1
            RETURNING 
              machine_id,
              machine_last_inspection::date AS last_inspection_date,
              next_inspection_date::date AS next_inspection_date
          `,
                    [machine_status_id]
                );
                row = updateRes.rows[0];
            } else {
                // 最低限: interval も next 列もない極端ケース → last_inspection のみ更新、次回は 90日後で返却計算
                const updateRes = await db.query(
                    `
            UPDATE machine_status
            SET machine_last_inspection = CURRENT_DATE
            WHERE machine_status_id = $1
            RETURNING machine_id, machine_last_inspection::date AS last_inspection_date
          `,
                    [machine_status_id]
                );
                const tmp = updateRes.rows[0];
                row = {
                    machine_id: tmp.machine_id,
                    last_inspection_date: tmp.last_inspection_date,
                    next_inspection_date: new Date().toISOString().slice(0, 10) // placeholder, 下で上書き
                };
            }
        } else {
            // レコードがない場合は新規行を追加
            if (hasInterval) {
                // interval がある新スキーマ
                const insertRes = await db.query(
                    `
              INSERT INTO machine_status (machine_id, machine_last_inspection)
              VALUES ($1, CURRENT_DATE)
              RETURNING 
                machine_id,
                machine_last_inspection::date AS last_inspection_date,
                (machine_last_inspection + inspection_interval_days)::date AS next_inspection_date
            `,
                    [machineId]
                );
                row = insertRes.rows[0];
            } else if (hasNextDate) {
                // 旧スキーマ: next_inspection_date を直接保持
                const insertRes = await db.query(
                    `
              INSERT INTO machine_status (machine_id, machine_last_inspection, next_inspection_date)
              VALUES ($1, CURRENT_DATE, CURRENT_DATE + 90)
              RETURNING 
                machine_id,
                machine_last_inspection::date AS last_inspection_date,
                next_inspection_date::date AS next_inspection_date
            `,
                    [machineId]
                );
                row = insertRes.rows[0];
            } else {
                // どちらの列もない想定外のスキーマ
                const insertRes = await db.query(
                    `
            INSERT INTO machine_status (machine_id, machine_last_inspection)
            VALUES ($1, CURRENT_DATE)
            RETURNING machine_id, machine_last_inspection::date AS last_inspection_date
          `,
                    [machineId]
                );
                const tmp = insertRes.rows[0];
                row = {
                    machine_id: tmp.machine_id,
                    last_inspection_date: tmp.last_inspection_date,
                    next_inspection_date: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
                };
            }
        }

        return NextResponse.json({
            machine_id: row.machine_id,
            last_inspection_date: typeof row.last_inspection_date === 'string'
                ? row.last_inspection_date
                : new Date(row.last_inspection_date).toISOString().slice(0, 10),
            next_inspection_date: typeof row.next_inspection_date === 'string'
                ? row.next_inspection_date
                : new Date(row.next_inspection_date).toISOString().slice(0, 10),
        });
    } catch (err) {
        console.error("API Error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
