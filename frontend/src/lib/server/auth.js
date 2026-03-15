import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';

const JWT_SECRET = env.JWT_SECRET || 'dev-secret-key-change-me';
const ENC_KEY = env.ENC_KEY || '12345678901234567890123456789012'; // 32 bytes for AES-256

export function generateAccessToken(user) {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

export function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// Password Target sekarang disimpan dalam Plain Text (Tanpa Enkripsi)
export function encrypt(text) {
    return text;
}

export function decrypt(cipherText) {
    return cipherText;
}
