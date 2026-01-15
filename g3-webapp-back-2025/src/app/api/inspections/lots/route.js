import { NextResponse } from 'next/server';
import pool from '@/lib/db';

/**
 * API: 3. 検査ロット取得 (一覧・ページネーション)
 * (GET /api/inspections/lots?section={section}&date={date}&page={page}&limit={limit})
 * * 修正: date指定がない場合、自動的に最新のデータが存在する日付を選択します。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section'); // 'spring' or 'alayer'
    const dateParam = searchParams.get('date');  // 'YYYY-MM-DD' (任意)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // --- ステップ 0: 対象日付の決定 (最新日付自動取得ロジック) ---
    let targetDate = dateParam;

    if (!targetDate) {
      try {
        // 日付指定がない場合、DBから最新の日付を取得する
        let latestDateQuery = `
          SELECT to_char(captured_at, 'YYYY-MM-DD') as latest_date
          FROM inspection_lots
        `;
        const latestParams = [];

        // セクション指定がある場合は絞り込む
        if (section) {
          latestDateQuery += ` WHERE section_code = $1`;
          latestParams.push(section);
        }

        latestDateQuery += ` ORDER BY captured_at DESC LIMIT 1`;

        const latestResult = await pool.query(latestDateQuery, latestParams);

        if (latestResult.rows.length > 0) {
          targetDate = latestResult.rows[0].latest_date;
        } else {
          // データが1件もない場合は本日 (UTC)
          targetDate = new Date().toISOString().split('T')[0];
        }
      } catch (e) {
        console.error('Latest date fetch error:', e);
        targetDate = new Date().toISOString().split('T')[0];
      }
    }

    // --- ステップ 1: 総件数と総ページ数 ---
    let whereClause = "WHERE 1=1";
    const queryParams = [];

    if (section) {
      whereClause += ` AND section_code = $${queryParams.length + 1}`;
      queryParams.push(section);
    }
    
    // 決定した targetDate で検索
    whereClause += ` AND to_char(captured_at, 'YYYY-MM-DD') = $${queryParams.length + 1}`;
    queryParams.push(targetDate);

    const countQuery = `SELECT COUNT(*) AS total FROM inspection_lots ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalCount / limit);

    // --- ステップ 2: ロット一覧を取得 ---
    const lotsQuery = `
      SELECT id, lot_id, section_code, captured_at
      FROM inspection_lots
      ${whereClause}
      ORDER BY captured_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    const lotsResult = await pool.query(lotsQuery, [...queryParams, limit, offset]);
    const lots = lotsResult.rows;

    if (lots.length === 0) {
      return NextResponse.json({ total_pages: totalPages, current_page: page, lots: [] });
    }

    // --- ステップ 3: ショット一括取得 ---
    const lotIds = lots.map(l => l.id);
    const shotsQuery = `
      SELECT 
        lot_id_ref, camera_id, c4k_seq, status, image_path, id, captured_at
      FROM inspection_camera_shots
      WHERE lot_id_ref = ANY($1::bigint[])
      ORDER BY id ASC;
    `;
    const shotsResult = await pool.query(shotsQuery, [lotIds]);
    const allShots = shotsResult.rows;

    // --- ステップ 4: レスポンス構築 ---
    const responseLots = lots.map(lot => {
      const lotShots = allShots.filter(s => s.lot_id_ref === lot.id);

      let representativeImage = null;

      // ★変更点: 初期値は親テーブルの時刻にしておくが、代表画像が見つかれば上書きする
      let displayCapturedAt = lot.captured_at;

      if (lotShots.length > 0) {
        const firstShot = lotShots[0];

        // ★変更点: 代表画像の時刻を採用する
        if (firstShot.captured_at) {
          displayCapturedAt = firstShot.captured_at;
        }

        if (firstShot.status === 'PASS' || firstShot.status === 'FAIL') {
          representativeImage = firstShot.image_path?.replace('beforeTest', 'afterTest');
        } else {
          representativeImage = firstShot.image_path;
        }
      }

      let pass = true;
      let details = {};

      if (lot.section_code === 'alayer') {
        // alayer (4Kシーケンス単位)
        const seqMap = new Map();
        lotShots.forEach(shot => {
          const k4 = shot.c4k_seq;
          if (!k4) return;
          const currentStatus = seqMap.get(k4);

          if (shot.status === 'FAIL') {
            seqMap.set(k4, 'FAIL');
            pass = false;
            return;
          }

          if (shot.status === 'MISSING') {
            if (currentStatus !== 'FAIL') {
              seqMap.set(k4, 'MISSING');
            }
            return;
          }

          if (!currentStatus) {
            seqMap.set(k4, 'PASS');
          }
        });
        details.four_k_sequences = Array.from(seqMap.entries()).map(([k, v]) => ({
          "c4k_seq": k, "status": v
        }));
      } else {
        // spring (カメラ単位)
        const camMap = new Map();
        lotShots.forEach(shot => {
          const cam = shot.camera_id;
          const currentStatus = camMap.get(cam);

          if (shot.status === 'FAIL') {
            camMap.set(cam, 'FAIL');
            pass = false;
            return;
          }

          if (shot.status === 'MISSING') {
            if (currentStatus !== 'FAIL') {
              camMap.set(cam, 'MISSING');
            }
            return;
          }

          if (!currentStatus) {
            camMap.set(cam, 'PASS');
          }
        });
        details.cameras = Array.from(camMap.entries()).map(([k, v]) => ({
          "camera_id": k, "status": v
        }));
      }

      return {
        lot_id: lot.lot_id,
        section: lot.section_code,
        captured_at: displayCapturedAt, // ★ここで代表画像の時刻 (または親時刻) を返す
        pass: pass,
        representative_image: representativeImage,
        ...details
      };
    });

    return NextResponse.json({
      total_pages: totalPages,
      current_page: page,
      lots: responseLots
    });

  } catch (error) {
    console.error('API Error (GET /inspections/lots):', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}