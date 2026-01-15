/**
 * ファイル概要
 * ==========
 * このファイルは 機械の稼働開始 を登録するAPIを提供します。
 * 最新レコードがあれば稼働開始時刻のみ更新、なければ新規レコードを作成します。
 * 稼働開始時刻はJSTで保存し、返却時もJST表記（+09:00）で返します。
 */
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { emitEvent } from "@/lib/event-bus"; // ★追加: Event Bus

// 機械の稼働開始 API
// POST /api/machines/{id}/start
/**
 * POST /api/machines/{id}/start
 * --------------------------------------
 * 指定機械の稼働開始時刻をJSTで記録します。
 *
 * 引数（Path Params）
 * - id         : 数値の machine_id または文字列の machine_name
 *
 * リクエストボディ
 * - なし
 *
 * 成功時の戻り値（200）
 * - started_at : 文字列。JST表記の開始時刻（"YYYY-MM-DDTHH:mm:ss+09:00"）。
 *
 * エラー
 * - 404 Machine not found     : 機械未存在。
 * - 500 Internal Server Error : 予期せぬエラー。
 *
 * 実装方針の要点
 * - idの種別（数値/文字列）により検索項目を切替え。
 * - DB保存は now() AT TIME ZONE 'Asia/Tokyo' を使用し、タイムゾーンのずれを回避。
 * - SSE通知は既存仕様に準拠（イベントキーは現状維持）。
 */
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

		// 2) 既存データがあるか確認（最新レコード）
		const latestRes = await db.query(
			`
				SELECT machine_status_id, machine_start_time
				FROM machine_status
				WHERE machine_id = $1
				ORDER BY machine_data_time DESC
				LIMIT 1
			`,
			[machineId]
		);

		let startedAt;
		if (latestRes.rows.length > 0) {
			// 3-a) 既存レコードがある場合は machine_start_time を更新
			const updated = await db.query(
				`
					UPDATE machine_status
					-- DBのタイムゾーンがUTCでもJSTで保存されるようにする
					SET machine_start_time = (now() AT TIME ZONE 'Asia/Tokyo')
					WHERE machine_status_id = $1
					RETURNING machine_start_time
				`,
				[latestRes.rows[0].machine_status_id]
			);
			startedAt = updated.rows[0].machine_start_time;
		} else {
			// 3-b) 既存がなければ新規作成
			const inserted = await db.query(
				`
					INSERT INTO machine_status (machine_id, machine_start_time)
					VALUES ($1, (now() AT TIME ZONE 'Asia/Tokyo'))
					RETURNING machine_start_time
				`,
				[machineId]
			);
			startedAt = inserted.rows[0].machine_start_time;
		}

		// レスポンスはJST表記（+09:00）で返す
		const toJstIso = (ts) => {
			if (!ts) return null;
			const s = String(ts).replace(' ', 'T').replace('Z', '');
			return /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}+09:00`;
		};

		// ★追加: SSEイベント通知 (設計書セクション4)
		emitEvent({
			ivent: "machine:started",
			message: "機械の稼働が開始されました"
		});

		return NextResponse.json({
			started_at: toJstIso(startedAt),
		});
	} catch (err) {
		console.error("API Error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}