/**
 * ファイル概要
 * ==========
 * このファイルは 指定機械の点検間隔（日） を更新するAPIを提供します。
 * 間隔は1〜3650日（約10年）を許容し、最新ステータス行が存在しない場合は新規作成にも対応します。
 */
import { NextResponse } from "next/server";
import db from "@/lib/db";

// 点検間隔の変更 API
// PUT /api/machines/{id}/inspection-interval
/**
 * PUT /api/machines/{id}/inspection-interval
 * --------------------------------------
 * 指定機械の点検間隔（inspection_interval_days）を更新し、次回点検日を返します。
 *
 * 引数（Path Params）
 * - id                  : 数値の machine_id または文字列の machine_name
 *
 * リクエストボディ（JSON）
 * - interval_days       : 整数（1〜3650）。点検間隔（日）。
 *
 * 成功時の戻り値（200）
 * - machine_id               : 数値。対象機械ID。
 * - inspection_interval_days : 数値。更新後の点検間隔（日）。
 * - next_inspection_date     : 文字列。次回点検日（YYYY-MM-DD）。
 *
 * エラー
 * - 400 Invalid interval_days provided : 入力が不正。
 * - 404 Machine not found              : 機械未存在。
 * - 500 Internal Server Error         : 予期せぬエラー。
 *
 * 実装方針の要点
 * - information_schema を用いて旧スキーマ(status列あり)と新スキーマを判別し、初回作成を分岐。
 * - 次回点検日は COALESCE(machine_last_inspection, CURRENT_DATE) + interval_days で算出。
 */
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