import { db } from '$lib/server/db';
import { generateAccessToken } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
    const { refresh_token } = await request.json();
    if (!refresh_token) return json({ error: 'Refresh token required' }, { status: 400 });

    const tokenData = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime(\'now\')').get(refresh_token);

    if (!tokenData) {
        return json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenData.user_id);
    if (!user) {
        return json({ error: 'User not found' }, { status: 401 });
    }

    const accessToken = generateAccessToken(user);
    return json({ access_token: accessToken });
}
