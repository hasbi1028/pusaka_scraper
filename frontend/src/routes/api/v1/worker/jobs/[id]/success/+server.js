import { db } from '$lib/server/db';
import { notify } from '$lib/server/sse';
import fs from 'fs';
import path from 'path';

export async function POST({ params, request }) {
    const { id } = params;
    const body = await request.json();

    let screenshotFilename = '';
    if (body.screenshot) {
        try {
            const buffer = Buffer.from(body.screenshot, 'base64');
            screenshotFilename = `sc-${id}-${Date.now()}.jpg`;
            const filePath = path.join(process.cwd(), 'static/screenshots', screenshotFilename);
            
            // Pastikan folder ada
            if (!fs.existsSync(path.dirname(filePath))) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
            }
            
            fs.writeFileSync(filePath, buffer);
        } catch (e) {
            console.error('Gagal menyimpan screenshot:', e);
        }
    }

    db.prepare(`
        UPDATE jobs 
        SET tanggal = ?, 
            jam_masuk = ?, 
            jam_pulang = ?, 
            status = 'success', 
            error = '', 
            screenshot = ?,
            duration_ms = ?, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(body.tanggal, body.jam_masuk, body.jam_pulang, screenshotFilename, body.duration_ms, id);
    
    notify();
    return new Response(null, { status: 204 });
}
