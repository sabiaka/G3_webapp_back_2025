import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール
import { writeFile } from 'fs/promises'; // 画像保存用
import {
  buildAfterImageUrl,
  buildBeforeImageUrl,
  prepareImageTarget,
} from '@/lib/image-storage';
import { emitEvent } from '@/lib/event-bus';

/**
 * API: 10. 検査結果一括登録(ばねどめ検査用)
 * (POST /api/ingress/inspection/batch/{lot_id})
 */
export async function POST(request, context) {
  const client = await pool.connect(); // 3つの処理(DB+画像x2)のためトランザクション
  
  try {
    const { lot_id: lotIdFromPath } = await context.params;
    // 1. パスパラメータ（{lot_id}）を取得

    // 2. multipart/form-data をパース
    const formData = await request.formData();
    const metadataJson = formData.get('metadata');
    const beforeImageFile = formData.get('beforeImage');
    const afterImageFile = formData.get('afterImage');

    // 3. バリデーション (3点すべて必須と仮定)
    if (!metadataJson || !beforeImageFile || !afterImageFile) {
      return NextResponse.json(
        { error: "Bad Request", details: "リクエストに 'metadata', 'beforeImage', 'afterImage' の3点すべてが必要です。" },
        { status: 400 }
      );
    }

    // 4. metadata (JSON) をパース
    let metadata;
    try {
      metadata = JSON.parse(metadataJson);
    } catch (e) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata が有効な JSON ではありません。" },
        { status: 400 }
      );
    }

    // 5. metadata の内容を検証 (API 10 の仕様)
    const { lot_id, section_code, camera_id, status, details, shot_seq } = metadata;
    
    // (API 10 は 'shot_seq' を、API 6 は 'c4k_seq' を使う)
    if (!lot_id || !section_code || !camera_id || !status || shot_seq === undefined) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata に 'lot_id', 'section_code', 'camera_id', 'status', 'shot_seq' が必要です。" },
        { status: 400 }
      );
    }
    
    // (パスの lot_id と JSON内の lot_id が一致するか確認)
    if (lotIdFromPath !== lot_id) {
       return NextResponse.json(
        { error: "Bad Request", details: "URLパスの {lot_id} と metadata 内の 'lot_id' が一致しません。" },
        { status: 400 }
      );
    }

    await client.query('BEGIN'); // --- トランザクション開始 ---

    // 6. (DB処理 1) パスの lot_id から inspection_lots の主キー (id) を取得
    //    (lot_id と section_code の両方が一致するものを探す)
    const lotResult = await client.query(
      'SELECT id FROM inspection_lots WHERE lot_id = $1 AND section_code = $2',
      [lotIdFromPath, section_code]
    );

    if (lotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: "Not Found", details: `指定された lot_id (${lotIdFromPath}) または section_code (${section_code}) が inspection_lots に見つかりません。` },
        { status: 404 }
      );
    }
    const lotIdRef = lotResult.rows[0].id; // これが inspection_camera_shots に使う lot_id_ref

    // 7. ファイル名を生成 (設計書セクション10のレスポンス例 に基づく)
    // (例: MAT-00125_B-spring01_1.jpg)
    // (拡張子はPythonサンプルの 'image/jpeg' に合わせ .jpg と仮定)
    const filename = `${lot_id}_${camera_id}_${shot_seq}.jpg`;
    
    // 8. 画像ファイル(Before)をサーバーに保存
    const beforeBuffer = Buffer.from(await beforeImageFile.arrayBuffer());
    const beforeImageUrl = buildBeforeImageUrl(filename);
    const beforeSavePath = await prepareImageTarget(beforeImageUrl);
    await writeFile(beforeSavePath, beforeBuffer);

    // 9. 画像ファイル(After)をサーバーに保存
    const afterBuffer = Buffer.from(await afterImageFile.arrayBuffer());
    const afterImageUrl = buildAfterImageUrl(filename);
    const afterSavePath = await prepareImageTarget(afterImageUrl);
    await writeFile(afterSavePath, afterBuffer);

    // 10. (DB処理 2) inspection_camera_shots にデータを INSERT
    // (API 10 は API 6/7 と違い、1回で結果(status)まで登録する)
    const imageDbPath = beforeImageUrl; // DBには 'beforeTest' のパスを保存
    const insertQuery = `
      INSERT INTO inspection_camera_shots (
        lot_id_ref, 
        camera_id, 
        shot_seq,      -- shot_seq カラム (ばねどめ用)
        status,       -- 'PASS' or 'FAIL'
        details,      -- 不良理由
        image_path,   -- beforeTest のパス
        captured_at   -- 撮影時刻 (metadata にないのでNOW()を使う)
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW());
    `;
    await client.query(insertQuery, [
      lotIdRef,
      camera_id,
      shot_seq,
      status,
      details || null,
      imageDbPath
    ]);

    await client.query('COMMIT'); // --- トランザクション確定 ---

    emitEvent({
      type: 'inspection:batchUploaded',
      lotId: lotIdFromPath,
      filename,
      status,
    });

    // 11. 成功レスポンス (201 Created)
    return NextResponse.json(
      {
        message: "検査結果登録完了👍️",
        lot_id: lotIdFromPath,
        filename: filename
      },
      { status: 201 }
    );

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK'); // --- エラー時ロールバック ---
    }
    console.error('API Error (POST ingress/inspection/batch/{lot_id}):', error);
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release(); // 接続をプールに返却
    }
  }
}