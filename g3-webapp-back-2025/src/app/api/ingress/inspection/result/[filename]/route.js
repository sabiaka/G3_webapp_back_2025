/**
 * ファイルの役割:
 *   【検査後(単発)更新】のAPIルート。
 *   filenameに紐づくショットを1件特定し、結果と任意の後画像を更新する。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // 修正済みのDB接続プール
import { writeFile } from 'fs/promises'; // 画像保存用
import { buildAfterImageUrl, prepareImageTarget } from '@/lib/image-storage';
import { emitEvent } from '@/lib/event-bus';

/**
 * API: 7. 【検査後】結果と画像の送信（filename指定・単発）
 * (PUT /api/ingress/inspection/result/{filename})
 * ★重複チェック機能付き
 *
 * 説明:
 *   DBの image_path 末尾一致でショットを特定し、status/details/captured_atを更新する。
 *   画像が送られてきた場合はAFTER画像を保存する。
 *
 * I/O:
 *   @param {Request} request                                   - multipart/form-data リクエスト
 *   @param {{ params: { filename: string } }} context          - パスパラメータ
 *   @returns {NextResponse}                                     - JSON: 更新結果
 *
 * リクエスト(form-data):
 *   metadata                                                    - JSON文字列。{ status('PASS'|'FAIL'), details?, captured_at? }
 *   image                                                       - 検査後画像(Binary, 任意)
 *
 * ステータス:
 *   200                                                         - 更新成功
 *   400                                                         - 入力エラー
 *   404                                                         - 該当なし
 *   409                                                         - 複数一致(データ重複)
 *   500                                                         - サーバ内部エラー
 */
export async function PUT(request, context) {
  const client = await pool.connect(); // トランザクションのために接続を専有
  
  try {
    // 1. パスパラメータ（{filename}）を取得
    const { filename } = await context.params; 

    // 2. multipart/form-data をパース
    const formData = await request.formData();
    const metadataJson = formData.get('metadata');
    const imageFile = formData.get('image'); // 検査後画像 (任意)

    // 3. バリデーション (metadata は必須)
    if (!metadataJson) {
      return NextResponse.json(
        { error: "Bad Request", details: "リクエストに 'metadata' (JSON) が必要です。" },
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

    // 5. metadata の内容を検証 (status は必須)
    const { status, details, captured_at } = metadata;
    if (!status || (status !== 'PASS' && status !== 'FAIL')) {
      return NextResponse.json(
        { error: "Bad Request", details: "metadata に 'status' ('PASS' または 'FAIL') が必要です。" },
        { status: 400 }
      );
    }

    await client.query('BEGIN'); // --- トランザクション開始 ---

    // 6. (DB処理 1) filename から、更新対象のショットID (id) を見つける
    const findQuery = `
      SELECT id 
      FROM inspection_camera_shots 
      WHERE image_path LIKE $1;
    `;
    const findParams = [`%/${filename}`]; 
    
    const findResult = await client.query(findQuery, findParams);

    // --- ★変更点: 検索結果の件数チェック ---

    if (findResult.rows.length === 0) {
      // 該当なし (404)
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: "Not Found", details: "指定された filename に一致する検査前データが見つかりません。" },
        { status: 404 }
      );
    }

    // ★追加: 重複チェック (2件以上ヒットしたらエラー)
    if (findResult.rows.length > 1) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { 
          error: "Conflict", 
          details: `ファイル名 '${filename}' に一致するデータが ${findResult.rows.length} 件見つかりました (重複データ)。DBを確認してください。`,
          code: "MULTIPLE_MATCHES"
        },
        { status: 409 } // Conflict エラー
      );
    }

    // ここまで来れば 1件だけ見つかったということ
    const shotId = findResult.rows[0].id; 

    // -------------------------------------

    // 7. (任意) 検査後画像ファイルが送信されていれば保存
    // なぜ: AFTER画像は検査結果の補助情報のため、任意扱い
    if (imageFile) {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      const imageUrl = buildAfterImageUrl(filename);
      const savePath = await prepareImageTarget(imageUrl);
      await writeFile(savePath, imageBuffer);
    }

    // 8. (DB処理 2) 検査結果で inspection_camera_shots を UPDATE
    const updateQuery = `
      UPDATE inspection_camera_shots
      SET 
        status = $1, 
        details = $2,
        captured_at = COALESCE($3, captured_at) 
      WHERE 
        id = $4;
    `;
    await client.query(updateQuery, [
      status,       // $1
      details || null, // $2
      captured_at || null, // $3
      shotId        // $4
    ]);

    await client.query('COMMIT'); // --- トランザクション確定 ---

    // ★修正: 設計書準拠のSSEイベント通知
    emitEvent({
      ivent: "inspection:resultUpdated",
      message: "検査結果が更新されました"
    });

    // 9. 成功レスポンス (200 OK)
    return NextResponse.json(
      {
        message: "検査結果、更新しといたよ！🎉", // 設計書に合わせて変更
        filename: filename
      },
      { status: 200 }
    );

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK'); // --- エラー時ロールバック ---
    }
    console.error('API Error (PUT ingress/inspection/result/{filename}):', error);
    
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