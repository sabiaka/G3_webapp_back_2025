import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import db from '@/lib/db'; // DB接続

// (generateNewLotId 関数は変更なし)
async function generateNewLotId(prefix) {
  const query = `
    SELECT lot_id FROM inspection_lots
    WHERE lot_id LIKE $1
    ORDER BY lot_id DESC
    LIMIT 1;
  `;
  const result = await db.query(query, [`${prefix}%`]);
  let nextNumber = 1;
  if (result.rows.length > 0) {
    const lastId = result.rows[0].lot_id;
    const lastNumber = parseInt(lastId.replace(prefix, ''), 10);
    nextNumber = lastNumber + 1;
  }
  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

/**
 * 6. 【初期登録】API (★画像パスをファイル名のみ保存ver)
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const metadataString = formData.get('metadata');
    const imageFile = formData.get('image'); 

    // (バリデーションは変更なし)
    if (!metadataString || !imageFile) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataとimageの両方が必須です。" }, { status: 400 });
    }
    const metadata = JSON.parse(metadataString);
    const { section_code, camera_id, shot_seq = 1, captured_at } = metadata;
    if (!section_code || !camera_id || !captured_at) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataに必要な 'section_code', 'camera_id', 'captured_at' が不足しています。" }, { status: 400 });
    }

    await db.query('BEGIN');

    // 3. lot_id の採番 (変更なし)
    let lotIdPrefix;
    if (section_code === 'spring') {
      lotIdPrefix = 'MAT-';
    } else if (section_code === 'alayer') {
      lotIdPrefix = 'LOLL-';
    } else {
      throw new Error(`不明なsection_codeです: ${section_code}`);
    }
    const newLotId = await generateNewLotId(lotIdPrefix);

    // 4. inspection_lots (ロット) をDBに登録 (変更なし)
    const insertLotQuery = `
      INSERT INTO inspection_lots (lot_id, section_code, captured_at)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const lotResult = await db.query(insertLotQuery, [newLotId, section_code, captured_at]);
    const lotDbId = lotResult.rows[0].id;

    // --- 5. ファイル名の生成と保存 (★修正) ---
    const extension = path.extname(imageFile.name) || '.jpg';
    const newFilename = `${newLotId}_${camera_id}_${shot_seq}${extension}`;
    
    // ★ DBに保存する値は、ファイル名のみ
    const publicImagePath = newFilename;

    // 物理的な保存先フォルダは変更なし
    const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'beforeTest');
    await fs.mkdir(uploadDir, { recursive: true });
    
    // 物理的な保存 (変更なし)
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, newFilename), buffer);

    // --- 6. inspection_camera_shots (ショット) をDBに登録 (★修正) ---
    const insertShotQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, camera_id, status, details, shot_seq, captured_at, image_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    await db.query(insertShotQuery, [
      lotDbId,
      camera_id,
      'MISSING',
      null,
      shot_seq,
      captured_at,
      publicImagePath // ★ ファイル名のみが保存される
    ]);

    await db.query('COMMIT');

    // --- 7. 成功レスポンス (★修正) ---
    return NextResponse.json(
      {
        "message": "初期データ登録OK！ロットIDを採番したよ。",
        "lot_id": newLotId,
        "filename": publicImagePath // ★ ファイル名のみを返す
      },
      { status: 201 }
    );

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[API ERROR] /api/ingress/inspection:', error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}