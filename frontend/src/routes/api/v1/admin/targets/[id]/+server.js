import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { encrypt } from '$lib/server/auth';
import { notify } from '$lib/server/sse';

export async function PUT({ params, request }) {
    const { id } = params;
    const { nip, nama, password } = await request.json();

    if (password) {
        db.prepare('UPDATE scrape_targets SET nip = ?, nama = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nip, nama, password, id);
    } else {
        db.prepare('UPDATE scrape_targets SET nip = ?, nama = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nip, nama, id);
    }
    
    notify();
    return new Response(null, { status: 204 });
}

export async function DELETE({ params }) {
    db.prepare('DELETE FROM scrape_targets WHERE id = ?').run(params.id);
    notify();
    return new Response(null, { status: 204 });
}
