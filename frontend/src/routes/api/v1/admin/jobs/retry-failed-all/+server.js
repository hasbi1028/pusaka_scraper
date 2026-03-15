import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { notify } from '$lib/server/sse';

export async function POST() {
    const result = db.prepare(`
        UPDATE jobs
        SET status = 'pending',
            error = '',
            progress_age_ms = 0,
            duration_ms = 0,
            claimed_by = '',
            claimed_at = NULL,
            heartbeat_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'failed'
    `).run();

    notify();
    return json({ retried_count: result.changes });
}
