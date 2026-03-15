import { db } from '$lib/server/db';
import { notify } from '$lib/server/sse';

export async function POST({ params, request }) {
    const { id } = params;
    const body = await request.json();

    const job = db.prepare("SELECT retry FROM jobs WHERE id = ?").get(id);
    const newRetry = (job?.retry || 0) + 1;
    
    db.prepare("UPDATE jobs SET status = 'failed', retry = ?, error = ?, duration_ms = ?, claimed_by = '', claimed_at = NULL, heartbeat_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(newRetry, `${body.error_type}: ${body.error_message}`, body.duration_ms, id);
    
    notify();
    return new Response(null, { status: 204 });
}
