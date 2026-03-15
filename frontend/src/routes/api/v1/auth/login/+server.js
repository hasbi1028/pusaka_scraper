import { db } from '$lib/server/db';
import { generateAccessToken, generateRefreshToken } from '$lib/server/auth';
import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function POST({ request }) {
    const { username, password } = await request.json();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
        uuidv4().replace(/-/g, ''), user.id, refreshToken, expiresAt.toISOString()
    );

    return json({ access_token: accessToken, refresh_token: refreshToken });
}
