import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
    const status = url.searchParams.get('status') || '';
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    let query = "SELECT * FROM jobs WHERE 1=1";
    const params = [];
    
    if (status) {
        query += " AND status = ?";
        params.push(status);
    }
    
    query += " ORDER BY updated_at DESC LIMIT ?";
    params.push(limit);
    
    const items = db.prepare(query).all(...params);
    return json({ items });
}
