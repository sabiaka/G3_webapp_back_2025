import { NextResponse } from "next/server";
import db from "@/lib/db";

// 機械の稼働開始 API (冪等)
// POST /api/machines/{id}/start
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

			// 2) 直近の開始情報取得（status 廃止に伴い start 時刻だけで冪等とする）
			const latestRes = await db.query(
			`
					SELECT machine_data_time, machine_start_time
					FROM machine_status
					WHERE machine_id = $1
					ORDER BY machine_data_time DESC
					LIMIT 1
			`,
				[machineId]
		);

		if (latestRes.rows.length > 0) {
			const latest = latestRes.rows[0];
				// 直近で開始時刻があれば「すでに開始済み」とみなし、その時刻を返す（冪等）
				if (latest.machine_start_time) {
					return NextResponse.json({
						status: "稼働中",
						started_at: new Date(latest.machine_start_time).toISOString(),
					});
				}
		}

			// 3) 稼働開始として新規レコードを記録（status は廃止）
			const insertRes = await db.query(
			`
					INSERT INTO machine_status (machine_id, machine_start_time)
					VALUES ($1, CURRENT_TIMESTAMP)
					RETURNING machine_start_time
			`,
				[machineId]
		);

			const startedAt = insertRes.rows[0].machine_start_time;
		return NextResponse.json({
			status: "稼働中",
			started_at: new Date(startedAt).toISOString(),
		});
	} catch (err) {
		console.error("API Error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

