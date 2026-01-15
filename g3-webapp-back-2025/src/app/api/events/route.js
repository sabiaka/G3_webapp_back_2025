/**
 * ファイルの役割:
 *   サーバー送信イベント(SSE)のストリームエンドポイントを提供するAPIルート。
 *   アプリ内のイベントバスから受け取ったイベントをSSEフォーマットでクライアントへ配信する。
 *
 * 実装ポリシー:
 *   - Next.jsのEdge/Node実行差異を避けるため `dynamic = 'force-dynamic'` を設定。
 *   - SSEの基本仕様に従い、ヘッダー/heartbeat/初期retry指示を適切に送出。
 *   - メモリリーク防止のため、接続終了時に購読解除・タイマー解除を必ず行う。
 */
import { onEvent } from '@/lib/event-bus';

export const dynamic = 'force-dynamic';

/**
 * SSEストリーム開始 (GET)
 *
 * 説明:
 *   クライアントと長時間接続を確立し、イベントバスからの通知を `data: <json>\n\n` 形式で逐次送信する。
 *   接続確認用に25秒毎のコメント(heartbeat)を送信し、再接続間隔(retry)も初回に指示する。
 *
 * I/O:
 *   @returns {Response}                                      - ヘッダーにSSE用の値を設定したストリーミングレスポンス
 *
 * ステータス:
 *   200                                                      - ストリーム開始(継続)
 */
export async function GET() {
  const encoder = new TextEncoder();
  let dispose = null;
  let keepAlive = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // ======== 送信関数の用意: 生文字列送信とSSEイベント送信 ========
      const sendRaw = (text) => {
        controller.enqueue(encoder.encode(text));
      };

      const sendEvent = (payload) => {
        sendRaw(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // ======== イベント購読: イベントバスからの通知をSSEへブリッジ ========
      dispose = onEvent(sendEvent);

      // ======== 接続維持(heartbeat): プロキシや中間経路による切断を防ぐため ========
      keepAlive = setInterval(() => {
        sendRaw(`: heartbeat\n\n`);
      }, 25000);

      // ======== 再接続間隔の指示: クライアントに5秒での再接続を促す ========
      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      // ======== 初回イベント送信: 接続確立の合図とタイムスタンプ ========
      sendEvent({
        type: 'sse:connected',
        connectedAt: new Date().toISOString(),
      });
    },
    cancel() {
      // ======== クリーンアップ: 二重実行防止しつつタイマー/購読を解放 ========
      if (closed) {
        return;
      }
      closed = true;
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      if (dispose) {
        dispose();
      }
    },
  });

  // ======== SSEレスポンス: 必須ヘッダーを付与して返却 ========
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
