import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import db from '@/lib/db'; // DB接続

/**
 * 10. 検査結果登録 (Read-then-Write 版)
 * (DBのUNIQUE制約が不要なロジック)
 * (captured_at は上書きしない)
 */
export async function POST(request, { params }) {
  const lot_id = params.lot_id;
  if (!lot_id) {
    return NextResponse.json({ "error": "Bad Request", "details": "URLに lot_id が必要です。" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const metadataString = formData.get('metadata');
    const beforeImage = formData.get('beforeImage');
    const afterImage = formData.get('afterImage');

    if (!metadataString) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataが必須です。" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataString);
    const { camera_id, status, details, shot_seq = 1, captured_at } = metadata;

    if (!camera_id || !status) {
      return NextResponse.json({ "error": "Bad Request", "details": "metadataに 'camera_id' と 'status' が必須です。" }, { status: 400 });
    }

    await db.query('BEGIN');

    // 1. lot_id から ロットのDB内部ID (lotDbId) を検索
    const lotQuery = 'SELECT id FROM inspection_lots WHERE lot_id = $1';
    const lotResult = await db.query(lotQuery, [lot_id]);

    if (lotResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return NextResponse.json(
        { "error": "Not Found", "details": `指定された lot_id [${lot_id}] が見つかりません。` },
        { status: 404 }
      );
    }
    const lotDbId = lotResult.rows[0].id; // 取得した内部ID (番)

    // 2. 更新/登録対象のショットが既に存在するか検索
    const findQuery = `
      SELECT id, image_path FROM inspection_camera_shots
      WHERE lot_id_ref = $1 AND camera_id = $2 AND shot_seq = $3
      LIMIT 1;
    `;
    const findResult = await db.query(findQuery, [lotDbId, camera_id, shot_seq]);
    
    const existingShot = findResult.rows.length > 0 ? findResult.rows[0] : null;

    // 3. 画像ファイルの処理
    const filename = `${lot_id}_${camera_id}_${shot_seq}.jpg`;
    // 既にDBにパスがある場合はそれを初期値に、なければnull
    let imagePathToSave = existingShot ? existingShot.image_path : null; 

    if (beforeImage) {
      const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'beforeTest');
      await fs.mkdir(uploadDir, { recursive: true });
      const buffer = Buffer.from(await beforeImage.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, filename), buffer);
      imagePathToSave = filename;
    }
    if (afterImage) {
      const uploadDir = path.join(process.cwd(), 'public', 'ImageDB', 'afterTest');
      await fs.mkdir(uploadDir, { recursive: true });
      const buffer = Buffer.from(await afterImage.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, filename), buffer);
      imagePathToSave = filename; // afterImage が優先
    }

    // 4. DB処理 (UPDATE or INSERT)
    if (existingShot) {
      // --- 見つかった場合 (UPDATE) ---
      const updateQuery = `
        UPDATE inspection_camera_shots
        SET
          status = $1,
          details = $2,
          image_path = $3
        WHERE
          id = $4;
      `;
      // (captured_at は更新しない)
      await db.query(updateQuery, [
        status,
        details,
        imagePathToSave,
        existingShot.id // 検索で見つけたid
      ]);

    } else {
      // --- 見つからなかった場合 (INSERT) ---
      const insertQuery = `
        INSERT INTO inspection_camera_shots (
          lot_id_ref, camera_id, shot_seq, status, details, captured_at, image_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `;
      await db.query(insertQuery, [
        lotDbId,
        camera_id,
        shot_seq,
        status,
        details,
        captured_at || new Date().toISOString(), // INSERT時は時刻を保存
        imagePathToSave
      ]);
    }

    await db.query('COMMIT');

    // 5. 成功レスポンス
    return NextResponse.json(
      {
        "message": "検査結果登録完了！",
        "lot_id": lot_id,
        "filename": imagePathToSave
      },
      { status: 201 }
    );

  } catch (error) {
    await db.query('ROLLBACK');
    console.error(`[API ERROR] /api/ingress/inspection/${lot_id}:`, error);
    return NextResponse.json({ "error": "Internal Server Error", "details": error.message }, { status: 500 });
  }
}