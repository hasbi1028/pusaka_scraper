import { db } from '$lib/server/db';
import { notify } from '$lib/server/sse';

export async function POST({ params, request }) {
    const { id } = params;
    const body = await request.json();

    db.prepare("UPDATE jobs SET tanggal = ?, jam_masuk = ?, jam_pulang = ?, status = 'success', error = '', duration_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(body.tanggal, body.jam_masuk, body.jam_pulang, body.duration_ms, id);
    
    notify();
    return new Response(null, { status: 204 });
}
