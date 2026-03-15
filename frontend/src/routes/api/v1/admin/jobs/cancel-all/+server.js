import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { notify } from '$lib/server/sse';

export async function POST() {
    const result = db.prepare(`
        UPDATE jobs
        SET status = 'failed',
            error = 'Dibatalkan oleh Admin',
            claimed_by = '',
            claimed_at = NULL,
            heartbeat_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('running', 'pending')
    `).run();

    if (result.changes > 0) {
        notify();
    }

    return json({ cancelled_count: result.changes });
}
