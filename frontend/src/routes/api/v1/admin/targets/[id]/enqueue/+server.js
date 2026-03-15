import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { notify } from '$lib/server/sse';

export async function POST({ params }) {
    const { id } = params;
    const target = db.prepare('SELECT * FROM scrape_targets WHERE id = ?').get(id);
    if (!target) return json({ error: 'Target not found' }, { status: 404 });

    // Cek apakah ada job yang sedang jalan
    const active = db.prepare("SELECT id FROM jobs WHERE nip = ? AND status IN ('pending', 'running')").get(target.nip);
    if (active) return json({ error: 'NIP has active job' }, { status: 409 });

    const jobId = uuidv4().replace(/-/g, '');
    db.prepare(`
        INSERT INTO jobs (id, nip, nama, password, status) 
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(nip) DO UPDATE SET 
            status='pending', error='', updated_at=CURRENT_TIMESTAMP
    `).run(jobId, target.nip, target.nama, target.password);

    notify();
    return json({ id: jobId }, { status: 201 });
}
