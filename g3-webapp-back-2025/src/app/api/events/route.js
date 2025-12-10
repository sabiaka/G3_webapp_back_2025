import { onEvent } from '@/lib/event-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  let dispose = null;
  let keepAlive = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const sendRaw = (text) => {
        controller.enqueue(encoder.encode(text));
      };

      const sendEvent = (payload) => {
        sendRaw(`data: ${JSON.stringify(payload)}\n\n`);
      };

      dispose = onEvent(sendEvent);

      keepAlive = setInterval(() => {
        sendRaw(`: heartbeat\n\n`);
      }, 25000);

      controller.enqueue(encoder.encode('retry: 5000\n\n'));
    },
    cancel() {
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
