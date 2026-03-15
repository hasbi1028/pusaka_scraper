import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { notify } from '$lib/server/sse';

export async function POST({ params }) {
    const { id } = params;
    
    const result = db.prepare(`
        UPDATE jobs 
        SET status = 'failed', 
            error = 'Dibatalkan oleh Admin', 
            claimed_by = '', 
            claimed_at = NULL, 
            heartbeat_at = NULL, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status IN ('running', 'pending')
    `).run(id);

    if (result.changes === 0) {
        return json({ error: 'Job not found or already finished' }, { status: 404 });
    }

    notify();
    return new Response(null, { status: 204 });
}
