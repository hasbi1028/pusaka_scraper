import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { notify } from '$lib/server/sse';

export async function POST({ params }) {
    const { id } = params;
    
    const result = db.prepare(`
        UPDATE jobs 
        SET status = 'pending', 
            error = '', 
            claimed_by = '', 
            claimed_at = NULL, 
            heartbeat_at = NULL, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status = 'failed'
    `).run(id);

    if (result.changes === 0) {
        // Cek jika ini adalah case Expired (Success tapi data lama)
        const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
        if (job) {
            db.prepare(`
                UPDATE jobs 
                SET status = 'pending', 
                    error = '', 
                    claimed_by = '', 
                    claimed_at = NULL, 
                    heartbeat_at = NULL, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(id);
        } else {
            return json({ error: 'Job not found' }, { status: 404 });
        }
    }

    notify();
    return new Response(null, { status: 204 });
}
