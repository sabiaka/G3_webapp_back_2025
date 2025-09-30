import { NextResponse } from "next/server";
import db from "@/lib/db";

// 点検間隔の変更 API
// PUT /api/machines/{id}/inspection-interval
export async function PUT(request, ctx) {
    const { id } = await ctx.params; // Next.js 15: params は非同期

    // 入力検証
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid interval_days provided" }, { status: 400 });
    }
    const intervalDays = body?.interval_days;
    if (
        typeof intervalDays !== "number" ||
        !Number.isInteger(intervalDays) ||
        intervalDays <= 0 ||
        intervalDays > 3650 // 約10年の上限（任意）
    ) {
        return NextResponse.json({ error: "Invalid interval_days provided" }, { status: 400 });
    }

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

        // 2) 最新レコード取得（なければ挿入を検討）
        const latestRes = await db.query(
            `
        SELECT machine_status_id, machine_last_inspection, inspection_interval_days
        FROM machine_status
        WHERE machine_id = $1
                ORDER BY machine_data_time DESC
        LIMIT 1
      `,
            [machineId]
        );

        // status列の有無を検出（移行期間の両対応）
        const colCheck = await db.query(
            `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'machine_status'
            AND column_name = 'status'
        ) AS has_status
      `
        );
        const hasStatus = !!colCheck.rows[0]?.has_status;

        // 3) 更新 or 新規作成
        let nextDateRow;
        if (latestRes.rows.length > 0) {
            // 既存最新行を更新
            const { machine_status_id } = latestRes.rows[0];
            const updateRes = await db.query(
                `
          UPDATE machine_status
          SET inspection_interval_days = $2
          WHERE machine_status_id = $1
          RETURNING
            inspection_interval_days,
            (COALESCE(machine_last_inspection, CURRENT_DATE) + $2::int) AS next_inspection_date
        `,
                [machine_status_id, intervalDays]
            );
            nextDateRow = updateRes.rows[0];
        } else {
            // レコードがない場合は新規行を追加
            if (hasStatus) {
                // status列が必要な旧スキーマ
                const insertRes = await db.query(
                    `
            INSERT INTO machine_status (machine_id, status, inspection_interval_days)
            VALUES ($1, '停止中', $2)
            RETURNING
              inspection_interval_days,
              (COALESCE(machine_last_inspection, CURRENT_DATE) + $2::int) AS next_inspection_date
          `,
                    [machineId, intervalDays]
                );
                nextDateRow = insertRes.rows[0];
            } else {
                // status列なしの新スキーマ
                const insertRes = await db.query(
                    `
            INSERT INTO machine_status (machine_id, inspection_interval_days)
            VALUES ($1, $2)
            RETURNING
              inspection_interval_days,
              (COALESCE(machine_last_inspection, CURRENT_DATE) + $2::int) AS next_inspection_date
          `,
                    [machineId, intervalDays]
                );
                nextDateRow = insertRes.rows[0];
            }
        }

        const nextDate = nextDateRow?.next_inspection_date;
        const nextInspectionDate =
            typeof nextDate === "string"
                ? nextDate
                : new Date(nextDate).toISOString().slice(0, 10);

        return NextResponse.json({
            machine_id: machineId,
            inspection_interval_days: nextDateRow.inspection_interval_days,
            next_inspection_date: nextInspectionDate,
        });
    } catch (err) {
        console.error("API Error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}