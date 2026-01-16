/**
 * ファイル概要
 * ==========
 * このファイルは 単一機械の集計情報 を返すAPIハンドラを提供します。
 * 指定された機械（数値IDまたは機械名）について、最新ステータスを基に以下を返します。
 * - 当日の稼働秒数（JSTの当日0:00〜現在までを切り出し）
 * - 当日の生産数
 * - 稼働開始時刻（JST時刻をISO風文字列で返却）
 * - 最終点検日と次回点検日（点検間隔がある場合は計算）
 *
 * ここでは生SQLを用い、必ずパラメータ化（$1, $2, ...）を行っています。
 * タイムゾーンはJST（Asia/Tokyo）基準で集計します。
 */
import { NextResponse } from "next/server";
import db from "@/lib/db"; // DB接続

/**
 * GET /api/machines/{id}
 * --------------------------------------
 * 機械の最新状態と当日集計を返します。idは数値IDまたは機械名のいずれも指定可能です。
 *
 * 引数（Path Params）
 * - id               : 数値の machine_id または文字列の machine_name
 *
 * 成功時の戻り値（200）
 * - machine_id               : 数値。対象機械ID。
 * - machine_name             : 文字列。機械名。
 * - started_at               : 文字列。JST基準での稼働開始時刻（"YYYY-MM-DDTHH:mm:SSZ" 形式互換）。
 * - today_uptime_seconds     : 数値。当日の稼働秒数（JST当日0:00以降を切り出し）。
 * - today_uptime_hms         : 文字列。稼働秒数のHH:MM:SS表示。
 * - today_production_count   : 数値。当日の生産数。
 * - last_inspection_date     : 文字列またはnull。最終点検日（YYYY-MM-DD）。
 * - next_inspection_date     : 文字列またはnull。次回点検日（YYYY-MM-DD）。
 * - inspection_interval_days : 数値またはnull。点検間隔（日）。
 *
 * エラー
 * - 404 Machine not found     : 指定の機械が存在しない場合。
 * - 500 Internal Server Error : 予期せぬエラー。
 *
 * 実装方針の要点
 * - idが数値ならmachine_id、文字列ならmachine_nameで特定。
 * - CTEで「最新行」「当日稼働秒数」「点検日」算出を段階的に分離し、読みやすさと保守性を確保。
 * - JSTの当日切り出しは date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') を基準に実施。
 */
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

    // クエリでやってること
    // - 最新ステータスを1件だけ取る（DISTINCT ON）
    // - JSTで今日の稼働秒数を出す（今日0:00〜今。startが昨日でも今日分だけ）
    // - 次回点検日は「最後の点検 + 間隔」（無ければ null）
    // - 生SQLは $1 とかでパラメータ化、タイムゾーンは JST（AT TIME ZONE 'Asia/Tokyo'）
    // 下のSQLでまとめて計算して返す
    const result = await db.query(
      `
      WITH jst AS (
        SELECT 
          (now() AT TIME ZONE 'Asia/Tokyo') AS now_jst,
          date_trunc('day', (now() AT TIME ZONE 'Asia/Tokyo')) AS today_start_jst
      ),
      latest AS (
        SELECT DISTINCT ON (m.machine_id)
          m.machine_id,
          m.machine_name,
          -- started_at（JSTをISO風に文字列化。互換のため末尾はZ）
          CASE WHEN s.machine_start_time IS NULL THEN NULL
               ELSE to_char((s.machine_start_time AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          END AS started_at,
          s.machine_start_time,
          s.machine_last_inspection,
          s.inspection_interval_days,
          COALESCE(s.today_production_count, 0)::int AS today_production_count
        FROM machines m
        LEFT JOIN LATERAL (
          SELECT *
          FROM machine_status s
          WHERE s.machine_id = m.machine_id
          ORDER BY s.machine_data_time DESC
          LIMIT 1
        ) s ON TRUE
        WHERE m.machine_id = $1
        ORDER BY m.machine_id, s.machine_data_time DESC
      ),
      uptime_calc AS (
        SELECT 
          l.machine_id,
          l.machine_name,
          l.started_at,
          l.today_production_count,
          -- 当日稼働秒数（JSTで本日0:00以降に限定し、startがそれ以前でも本日分のみカウント）
          CASE 
            WHEN l.machine_start_time IS NULL THEN 0
            ELSE GREATEST(
              0,
              EXTRACT(
                EPOCH FROM (
                  (SELECT now_jst FROM jst) - GREATEST(
                    l.machine_start_time,
                    (SELECT today_start_jst FROM jst)
                  )
                )
              )::int
            )
          END AS today_uptime_seconds,
          l.machine_last_inspection,
          l.inspection_interval_days
        FROM latest l
      ),
      inspection AS (
        SELECT 
          machine_id,
          to_char(machine_last_inspection::date, 'YYYY-MM-DD') AS last_inspection_date,
          CASE 
            WHEN machine_last_inspection IS NOT NULL AND inspection_interval_days IS NOT NULL
              THEN to_char((machine_last_inspection + inspection_interval_days)::date, 'YYYY-MM-DD')
            ELSE NULL
          END AS next_inspection_date,
          inspection_interval_days
        FROM latest
      )
      SELECT 
        u.machine_id,
        u.machine_name,
        u.started_at,
        u.today_uptime_seconds,
        u.today_production_count,
        i.last_inspection_date,
        i.next_inspection_date,
        i.inspection_interval_days
      FROM uptime_calc u
      JOIN inspection i ON u.machine_id = i.machine_id
      `,
      [machineId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    const machine = result.rows[0];

    // フォーマッタ
    const toDateStr = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.slice(0, 10);
      try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
    };
    const toHms = (secs) => {
      const s = Math.max(0, parseInt(secs ?? 0, 10));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    const lastInspection = toDateStr(machine.last_inspection_date);
    const nextInspection = toDateStr(machine.next_inspection_date);

    return NextResponse.json({
      machine_id: machine.machine_id,
      machine_name: machine.machine_name,
      started_at: machine.started_at,
      today_uptime_seconds: machine.today_uptime_seconds,
      today_uptime_hms: toHms(machine.today_uptime_seconds),
  today_production_count: Number.isFinite(Number(machine.today_production_count)) ? Number(machine.today_production_count) : 0,
      last_inspection_date: lastInspection,
      next_inspection_date: nextInspection,
      inspection_interval_days: machine.inspection_interval_days ?? null
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
