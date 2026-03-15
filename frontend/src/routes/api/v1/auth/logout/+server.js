import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
    const { refresh_token } = await request.json();
    if (refresh_token) {
        db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(refresh_token);
    }
    return new Response(null, { status: 204 });
}
