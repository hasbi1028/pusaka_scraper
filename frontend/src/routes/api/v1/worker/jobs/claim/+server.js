import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { notify } from '$lib/server/sse';

export async function POST({ request }) {
    const { worker_id } = await request.json();
    
    // Gunakan transaksi untuk atomicity
    const transaction = db.transaction(() => {
        const job = db.prepare(`
            SELECT id, nip, nama, password, retry
            FROM jobs 
            WHERE status = 'pending' 
            ORDER BY updated_at ASC 
            LIMIT 1
        `).get();

        if (!job) return null;

        const result = db.prepare(`
            UPDATE jobs 
            SET status = 'running', claimed_by = ?, claimed_at = CURRENT_TIMESTAMP, heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
        `).run(worker_id, job.id);

        if (result.changes === 0) return null;

        return job;
    });

    const job = transaction();
    if (job) notify();

    return json({ job });
}
