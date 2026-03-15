import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { encrypt, decrypt } from '$lib/server/auth';
import { v4 as uuidv4 } from 'uuid';
import { notify } from '$lib/server/sse';

export async function GET({ url }) {
    const q = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const items = db.prepare(`
        SELECT 
            t.id, t.nip, t.nama, t.created_at, t.password,
            COALESCE(j.status, 'idle') as status,
            COALESCE(j.jam_masuk, '') as jam_masuk,
            COALESCE(j.jam_pulang, '') as jam_pulang,
            COALESCE(j.error, '') as error,
            COALESCE(j.updated_at, '') as last_run
        FROM scrape_targets t
        LEFT JOIN (
            SELECT nip, status, jam_masuk, jam_pulang, error, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY nip ORDER BY updated_at DESC) as rn
            FROM jobs
        ) j ON t.nip = j.nip AND j.rn = 1
        WHERE (t.nip LIKE ? OR t.nama LIKE ?)
        ORDER BY t.created_at DESC 
        LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit);

    return json({ items });
}

export async function POST({ request }) {
    const { nip, nama, password } = await request.json();
    if (!nip || !password) return json({ error: 'NIP and Password required' }, { status: 400 });

    const id = uuidv4().replace(/-/g, '');

    try {
        db.prepare('INSERT INTO scrape_targets (id, nip, nama, password) VALUES (?, ?, ?, ?)').run(id, nip, nama, password);
        notify();
        return json({ id }, { status: 201 });
    } catch (err) {
        return json({ error: 'NIP already exists' }, { status: 409 });
    }
}
