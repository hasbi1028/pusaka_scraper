import { migrate, db } from '$lib/server/db';
import { verifyToken } from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import { notify } from '$lib/server/sse';
import { error, json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '$env/dynamic/private';

// Jalankan migrasi saat startup
migrate();

// Pastikan Admin ada
const adminUser = env.ADMIN_USER || 'admin';
const adminPass = env.ADMIN_PASSWORD || 'admin123';
const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUser);
if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
        uuidv4().replace(/-/g, ''), adminUser, hash, 'admin'
    );
    logger.info('WEB', 'Default admin user created');
}

// Stale Job Recovery Loop
setInterval(async () => {
    try {
        const threshold = new Date(Date.now() - 60000).toISOString();
        const result = db.prepare(`
            UPDATE jobs 
            SET status = 'failed', 
                retry = retry + 1, 
                error = 'Worker timeout (No heartbeat)', 
                claimed_by = '', 
                claimed_at = NULL, 
                heartbeat_at = NULL, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE status = 'running' AND (heartbeat_at IS NULL OR datetime(heartbeat_at) < datetime(?))
        `).run(threshold);

        if (result.changes > 0) {
            logger.warn('SYSTEM', `Recovered ${result.changes} stale jobs`);
            notify();
        }
    } catch (err) {
        logger.error('SYSTEM', 'Stale recovery loop error', { error: err });
    }
}, 30000);

export async function handle({ event, resolve }) {
    const start = Date.now();
    const isWorkerPath = event.url.pathname.startsWith('/api/v1/worker');
    const source = isWorkerPath ? 'WORKER' : 'WEB';

    // Proteksi rute /api/v1/admin/*
    if (event.url.pathname.startsWith('/api/v1/admin')) {
        // Izinkan worker membaca settings
        const isSettings = event.url.pathname === '/api/v1/admin/settings' && event.request.method === 'GET';
        
        let token = event.request.headers.get('Authorization')?.split(' ')[1];
        if (!token) token = event.url.searchParams.get('token');

        if (!token && !isSettings) {
            logger.warn(source, 'Unauthorized access attempt', { path: event.url.pathname });
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (token) {
            const decoded = verifyToken(token);
            if (!decoded && !isSettings) {
                logger.warn(source, 'Invalid token access', { path: event.url.pathname });
                return json({ error: 'Invalid or expired token' }, { status: 401 });
            }
            event.locals.user = decoded;
        }
    }

    // Proteksi rute /api/v1/worker/* dan rute admin khusus settings (untuk worker)
    if (isWorkerPath || (event.url.pathname === '/api/v1/admin/settings' && event.request.method === 'GET')) {
        let workerToken = event.request.headers.get('X-Worker-Token');
        if (!workerToken) workerToken = event.url.searchParams.get('token');
        
        const expected = env.WORKER_TOKEN || 'dev-worker-token';
        if (workerToken === expected) {
            // Valid worker, let it pass
        } else if (!event.locals.user) {
            logger.error('WORKER', 'Unauthorized worker token', { 
                path: event.url.pathname,
                received: workerToken ? 'provided' : 'empty'
            });
            return json({ error: 'Invalid worker token' }, { status: 401 });
        }
    }

    const response = await resolve(event);
    
    // Log API requests only
    if (event.url.pathname.startsWith('/api')) {
        const duration = Date.now() - start;
        logger.info(source, `${event.request.method} ${event.url.pathname}`, {
            status: response.status,
            duration: `${duration}ms`,
            user: event.locals.user?.username
        });
    }

    return response;
}
