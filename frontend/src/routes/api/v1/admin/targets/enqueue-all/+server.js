import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { notify } from '$lib/server/sse';

export async function POST() {
    const targets = db.prepare('SELECT nip, nama, password FROM scrape_targets').all();
    
    let enqueued = 0;
    let skipped = 0;

    const transaction = db.transaction(() => {
        for (const target of targets) {
            // Cek apakah ada job yang sedang jalan atau pending
            const active = db.prepare("SELECT id FROM jobs WHERE nip = ? AND status IN ('pending', 'running')").get(target.nip);
            
            if (active) {
                skipped++;
                continue;
            }

            const jobId = uuidv4().replace(/-/g, '');
            db.prepare(`
                INSERT INTO jobs (id, nip, nama, password, status) 
                VALUES (?, ?, ?, ?, 'pending')
                ON CONFLICT(nip) DO UPDATE SET 
                    status='pending', error='', updated_at=CURRENT_TIMESTAMP
            `).run(jobId, target.nip, target.nama, target.password);
            
            enqueued++;
        }
    });

    transaction();

    if (enqueued > 0) {
        notify();
    }

    return json({
        total_targets: targets.length,
        enqueued_count: enqueued,
        skipped_running_count: skipped
    });
}
