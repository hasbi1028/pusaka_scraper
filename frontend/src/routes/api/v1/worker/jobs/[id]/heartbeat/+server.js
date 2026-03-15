import { db } from '$lib/server/db';

export async function POST({ params, request }) {
    const { id } = params;
    const { progress_age_ms } = await request.json();

    db.prepare("UPDATE jobs SET heartbeat_at = CURRENT_TIMESTAMP, progress_age_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'")
      .run(progress_age_ms || 0, id);
      
    return new Response(null, { status: 204 });
}
