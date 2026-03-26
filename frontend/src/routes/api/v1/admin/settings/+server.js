import { json } from '@sveltejs/kit';

// Default settings
let settings = {
    headedMode: false,
    maxConcurrency: 5,
    workTimeStart: '07:30',
    workTimeEnd: '16:00'
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
    if (body.workTimeStart !== undefined) settings.workTimeStart = body.workTimeStart;
    if (body.workTimeEnd !== undefined) settings.workTimeEnd = body.workTimeEnd;
    
    return json(settings);
}
