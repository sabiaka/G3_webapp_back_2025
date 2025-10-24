import { NextResponse } from "next/server";
import db from "@/lib/db"; // db.query() を直接使う

// ★ 修正: client の代わりに db を直接受け取る
async function generateNewMatLotId(db) {
  const prefix = 'MAT-';
  const query = `
    SELECT lot_id FROM inspection_lots
    WHERE lot_id LIKE $1
    ORDER BY lot_id DESC
    LIMIT 1;
  `;
  // ★ 修正: client.query -> db.query
  const result = await db.query(query, [`${prefix}%`]);

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const lastId = result.rows[0].lot_id;
    const lastNumber = parseInt(lastId.replace(prefix, ''), 10);
    nextNumber = lastNumber + 1;
  }
  return `${prefix}${String(nextNumber).padStart(5, '0')}`; 
}


// 生産数インクリメント API
export async function POST(request, ctx) {
    const { id } = await ctx.params;

    // ★ 修正: db.connect() を削除
    // const client = await db.connect(); 

    try {
        // 1) 機械の存在確認
        const isNumericId = /^\d+$/.test(String(id));
        let machineId;
        if (isNumericId) {
            // ★ 修正: client.query -> db.query
            const res = await db.query(
                "SELECT machine_id FROM machines WHERE machine_id = $1",
                [parseInt(id, 10)]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "Machine not found" }, { status: 404 });
            }
            machineId = res.rows[0].machine_id;
        } else {
            // ★ 修正: client.query -> db.query
            const res = await db.query(
                "SELECT machine_id FROM machines WHERE machine_name = $1",
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "Machine not found" }, { status: 404 });
            }
            machineId = res.rows[0].machine_id;
        }

        // 2) 直近のステータス行取得
        // ★ 修正: client.query -> db.query
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
            // ★ 修正: client.release() を削除
            return NextResponse.json(
                { error: "Machine is not running" },
                { status: 409 }
            );
        }

        // ★ 修正: client.query -> db.query
        await db.query('BEGIN');

        const latest = latestRes.rows[0];
        const { machine_status_id, machine_start_time, machine_data_time } = latest;

        // 3) JSTで日付ロール判定
        // ★ 修正: client.query -> db.query
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

        // 4) 新しい 'MAT-' の lot_id を採番
        // ★ 修正: db を渡す
        const newLotId = await generateNewMatLotId(db); 
        const section_code = 'spring'; 
        const captured_at = new Date().toISOString();

        // 5) inspection_lots テーブルに新しいロットを INSERT
        const insertLotQuery = `
            INSERT INTO inspection_lots (lot_id, section_code, captured_at)
            VALUES ($1, $2, $3)
        `;
        // ★ 修正: client.query -> db.query
        await db.query(insertLotQuery, [
            newLotId,
            section_code,
            captured_at
        ]);
        console.log(`[API 5] 新規ロット作成 (生産開始): ${newLotId}`);


        if (String(todayJst) !== String(rowDate)) {
            // 6-A) 日付が変わっていたら
            // ★ 修正: client.query -> db.query
            const insertRes = await db.query(
                `
                    INSERT INTO machine_status (machine_id, machine_start_time, today_production_count)
                    VALUES ($1, $2, 1)
                    RETURNING today_production_count
                `,
                [machineId, machine_start_time]
            );

            // ★ 修正: client.query -> db.query
            await db.query('COMMIT');

            return NextResponse.json({
                today_production_count: insertRes.rows[0].today_production_count,
                new_lot_id: newLotId 
            });
        } else {
            // 6-B) 同日中なら +1
            // ★ 修正: client.query -> db.query
            const updateRes = await db.query(
                `
                UPDATE machine_status
                SET today_production_count = COALESCE(today_production_count, 0) + 1
                WHERE machine_status_id = $1
                RETURNING today_production_count
                `,
                [machine_status_id]
            );

            // ★ 修正: client.query -> db.query
            await db.query('COMMIT');

            return NextResponse.json({
                today_production_count: updateRes.rows[0].today_production_count,
                new_lot_id: newLotId 
            });
        }
    } catch (err) {
        // ★ 修正: client.query -> db.query
        await db.query('ROLLBACK');
        console.error("API Error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    } 
    // ★ 修正: finally ブロック (client.release()) を削除
}