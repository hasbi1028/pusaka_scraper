import { subscribe } from '$lib/server/sse';

export async function GET({ request }) {
    // Auth sudah ditangani di hooks.server.js (X-Worker-Token)
    let controllerClosed = false;
    
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            const send = (event, data) => {
                if (controllerClosed) return;
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
                } catch (e) {
                    controllerClosed = true;
                }
            };

            // Kirim koneksi sukses
            send('connected', 'worker_ready');

            // Subscribe ke global notifier
            const unsubscribe = subscribe((event) => {
                send(event, 'check_jobs');
            });

            const keepAlive = setInterval(() => {
                send('ping', 'keep-alive');
            }, 20000);

            return () => {
                controllerClosed = true;
                unsubscribe();
                clearInterval(keepAlive);
            };
        },
        cancel() {
            controllerClosed = true;
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}
