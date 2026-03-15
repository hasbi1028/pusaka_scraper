import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function GET({ params }) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(params.id);
    if (!job) return json({ error: 'Job not found' }, { status: 404 });
    return json(job);
}
