import { json } from '@sveltejs/kit';

// Default settings
let settings = {
    headedMode: false,
    maxConcurrency: 5
};

export async function GET() {
    return json(settings);
}

export async function POST({ request }) {
    const body = await request.json();
    
    if (body.headedMode !== undefined) settings.headedMode = !!body.headedMode;
    if (body.maxConcurrency !== undefined) {
        const val = parseInt(body.maxConcurrency);
        if (!isNaN(val) && val > 0) settings.maxConcurrency = val;
    }
    
    return json(settings);
}
