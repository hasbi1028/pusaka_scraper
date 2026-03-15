import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function GET() {
    const stats = {
        total: db.prepare("SELECT COUNT(*) as n FROM jobs").get().n,
        pending: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get().n,
        running: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'running'").get().n,
        success: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'success'").get().n,
        failed: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'failed'").get().n,
        not_success: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status != 'success'").get().n,
        incomplete_presence: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'success' AND (jam_masuk = '' OR jam_pulang = '')").get().n
    };
    return json(stats);
}
