import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // データベース接続プール

const INITIAL_LOT_SEQUENCE = '00001';

function getLotPrefix(section) {
  if (section === 'spring') return 'MAT-';
  if (section === 'alayer') return 'LOLL-';
  throw new Error(`未対応のセクションです: ${section}`);
}

/**
 * lot_idの数値部分をインクリメントして新しいIDを生成する
 * (例: "MAT-00123" -> "MAT-00124")
 * @param {string} currentLotId - 現在のロットID
 * @returns {string} - 新しいロットID
 * @throws {Error} - "MAT-ABC" のような不正な形式の場合
 */
function getNextLotId(currentLotId) {
  // 正規表現で "プレフィックス" と "数値部分" に分割
  // (例: "MAT-00123" -> ["MAT-", "00123"])
  const matches = currentLotId.match(/^([A-Z]+-)(\d+)$/);

  if (!matches || matches.length < 3) {
    throw new Error(`不正なロットID形式です: ${currentLotId}`);
  }

  const prefix = matches[1];      // "MAT-"
  const numberPart = matches[2];  // "00123"
  const numberLength = numberPart.length; // 5

  const currentNumber = parseInt(numberPart, 10); // 123
  const nextNumber = currentNumber + 1;           // 124

  // padStartで桁数を維持 (例: 124 -> "00124")
  const newNumberPart = String(nextNumber).padStart(numberLength, '0');

  return prefix + newNumberPart; // "MAT-00124"
}

/**
 * API: 5. 生産数をインクリメント（lot_idも加算）
 * (POST /api/machines/{id}/increment-production?section={section})
 */
export async function POST(request, context) {
  const client = await pool.connect(); 
  
  try {
    // 1. パスパラメータとクエリパラメータを取得
    const { id: machineId } = await context.params; // パスから {id} を取得
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

    // --- ▼ 変更点 ▼ ---
    // 3. (処理A) machine_status の "最新の行" の today_production_count を +1 する
    //    (machine_id = $1 の中で、machine_status_id が最大の行のみを対象)
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
    // --- ▲ 変更点 ▲ ---

    const updateResult = await client.query(updateCountQuery, [machineId]);

    if (updateResult.rows.length === 0) {
      // 該当する machine_id が存在しなかった (もしくはサブクエリで見つからなかった)
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
      // 既存ロットが無ければ 00001 から開始
      newLotId = `${lotPrefix}${INITIAL_LOT_SEQUENCE}`;
    } else {
      const currentLotId = currentLotResult.rows[0].lot_id; // (例: "MAT-00123")
      newLotId = getNextLotId(currentLotId); // (例: "MAT-00124")
    }

    // 6. (処理D) 新しい lot_id で inspection_lots に "新行" を作成
    const createNewLotQuery = `
      INSERT INTO inspection_lots (lot_id, section_code, captured_at)
      VALUES ($1, $2, NOW());
    `;
    await client.query(createNewLotQuery, [newLotId, section]);

    await client.query('COMMIT'); // --- トランザクション確定 ---

    // 7. 成功レスポンス
    return NextResponse.json({
      today_production_count: newProductionCount,
      lot_id: newLotId // +1 された新しいIDを返す
    });

  } catch (error) {
    await client.query('ROLLBACK'); // --- エラー時ロールバック ---
    
    // lot_id の形式が "MAT-ABC" などで getNextLotId が失敗した場合
    if (error.message.includes('不正なロットID形式')) {
      return NextResponse.json(
        { error: "Internal Server Error", details: `DB内のロットID形式が不正です: ${error.message}` },
        { status: 500 }
      );
    }
    
    // その他のDBエラー
    console.error('API Error (increment-production):', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release(); // 接続をプールに返却
  }
}