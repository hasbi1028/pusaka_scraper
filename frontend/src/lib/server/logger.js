import { env } from '$env/dynamic/private';

const IS_DEV = env.NODE_ENV === 'development';

function formatLine(source, msg, ctx = {}) {
    const ts = new Date().toLocaleTimeString();
    const label = `[${source}]`.padEnd(9);
    const status = ctx.status ? ` | ${ctx.status}` : '';
    const duration = ctx.duration ? ` (${ctx.duration})` : '';
    const user = ctx.user && ctx.user !== 'anonymous' ? ` | @${ctx.user}` : '';
    const error = ctx.error ? ` | ERROR: ${ctx.error}` : '';

    return `[${ts}] ${label} ${msg}${status}${duration}${user}${error}`;
}

export const logger = {
    info: (source, msg, ctx) => console.log(formatLine(source, msg, ctx)),
    warn: (source, msg, ctx) => console.warn(formatLine(source, 'WARN: ' + msg, ctx)),
    error: (source, msg, ctx) => {
        const errMsg = ctx?.error instanceof Error ? ctx.error.message : (ctx?.error || '');
        console.error(formatLine(source, msg, { ...ctx, error: errMsg }));
    },
    debug: (source, msg, ctx) => {
        if (IS_DEV) console.debug(formatLine(source, 'DEBUG: ' + msg, ctx));
    }
};
