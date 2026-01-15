import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // データベース接続プール
import { emitEvent } from '@/lib/event-bus';

const INITIAL_LOT_SEQUENCE = '00001';

function getLotPrefix(section) {
  if (section === 'spring') return 'MAT-';
  if (section === 'alayer') return 'LOLL-';
  throw new Error(`未対応のセクションです: ${section}`);
}

/**
 * lot_idの数値部分をインクリメントして新しいIDを生成する
 * (例: "MAT-00123" -> "MAT-00124")
 */
function getNextLotId(currentLotId) {
  const matches = currentLotId.match(/^([A-Z]+-)(\d+)$/);

  if (!matches || matches.length < 3) {
    throw new Error(`不正なロットID形式です: ${currentLotId}`);
  }

  const prefix = matches[1];      // "MAT-"
  const numberPart = matches[2];  // "00123"
  const numberLength = numberPart.length;

  const currentNumber = parseInt(numberPart, 10);
  const nextNumber = currentNumber + 1;

  const newNumberPart = String(nextNumber).padStart(numberLength, '0');

  return prefix + newNumberPart;
}

/**
 * API: 5. 生産数をインクリメント（lot_idも加算）
 * (POST /api/machines/{id}/increment-production?section={section})
 */
export async function POST(request, context) {
  const client = await pool.connect(); 
  
  try {
    // 1. パスパラメータとクエリパラメータを取得
    const { id: machineId } = await context.params;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    // 2. バリデーション (section)
    if (!section) {
      return NextResponse.json(
        { error: "Bad Request", details: ["クエリパラメータ 'section' は必須です。"] },
        { status: 400 }
      );
    }
    if (section !== 'spring' && section !== 'alayer') {
      return NextResponse.json(
        { error: "Bad Request", details: ["'section' は 'spring' または 'alayer' を指定してください。"] },
        { status: 400 }
      );
    }

    await client.query('BEGIN'); // --- トランザクション開始 ---

    // 3. (処理A) machine_status の "最新の行" の today_production_count を +1 する
    const updateCountQuery = `
      UPDATE machine_status
      SET today_production_count = today_production_count + 1
      WHERE machine_id = $1
        AND machine_status_id = (
          SELECT MAX(machine_status_id)
          FROM machine_status
          WHERE machine_id = $1
        )
      RETURNING today_production_count;
    `;

    const updateResult = await client.query(updateCountQuery, [machineId]);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: "Machine not found" },
        { status: 404 }
      );
    }
    const newProductionCount = updateResult.rows[0].today_production_count;

    // 4. (処理B) inspection_lots から現在の lot_id を取得
    const getCurrentLotQuery = `
      SELECT lot_id 
      FROM inspection_lots
      WHERE section_code = $1
      ORDER BY captured_at DESC
      LIMIT 1;
    `;
    const currentLotResult = await client.query(getCurrentLotQuery, [section]);

    const lotPrefix = getLotPrefix(section);
    let newLotId;

    if (currentLotResult.rows.length === 0) {
      newLotId = `${lotPrefix}${INITIAL_LOT_SEQUENCE}`;
    } else {
      const currentLotId = currentLotResult.rows[0].lot_id;
      newLotId = getNextLotId(currentLotId);
    }

    // 6. (処理D) 新しい lot_id で inspection_lots に "新行" を作成
    const createNewLotQuery = `
      INSERT INTO inspection_lots (lot_id, section_code, captured_at)
      VALUES ($1, $2, NOW());
    `;
    await client.query(createNewLotQuery, [newLotId, section]);

    await client.query('COMMIT'); // --- トランザクション確定 ---

    // ★修正: 設計書準拠のSSEイベント通知
    emitEvent({
      ivent: "production:lotIncremented",
      message: "生産数がインクリメントされました"
    });

    // 7. 成功レスポンス
    return NextResponse.json({
      today_production_count: newProductionCount,
      lot_id: newLotId
    });

  } catch (error) {
    await client.query('ROLLBACK'); // --- エラー時ロールバック ---
    
    if (error.message.includes('不正なロットID形式')) {
      return NextResponse.json(
        { error: "Internal Server Error", details: `DB内のロットID形式が不正です: ${error.message}` },
        { status: 500 }
      );
    }
    
    console.error('API Error (increment-production):', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}