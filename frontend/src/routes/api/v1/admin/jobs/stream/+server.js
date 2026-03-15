import { subscribe } from '$lib/server/sse';

export async function GET() {
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

            send('connected', 'ok');

            const unsubscribe = subscribe((event) => {
                send(event, 'jobs_changed');
            });

            const keepAlive = setInterval(() => {
                send('ping', 'keep-alive');
            }, 15000);

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
