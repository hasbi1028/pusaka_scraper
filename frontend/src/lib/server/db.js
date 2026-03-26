import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import path from 'path';
import fs from 'fs';

const DB_PATH = env.DB_PATH || '../data/pusaka.db';

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Setup SQLite Pragma
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Migrations (Pindahan dari Go)
export function migrate() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            nip TEXT NOT NULL,
            nama TEXT NOT NULL DEFAULT '',
            password TEXT NOT NULL,
            tanggal TEXT NOT NULL DEFAULT '',
            jam_masuk TEXT NOT NULL DEFAULT '',
            jam_pulang TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            screenshot TEXT NOT NULL DEFAULT '',
            retry INTEGER NOT NULL DEFAULT 0,
            error TEXT NOT NULL DEFAULT '',
            heartbeat_at DATETIME,
            progress_age_ms INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            claimed_by TEXT NOT NULL DEFAULT '',
            claimed_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scrape_targets (
            id TEXT PRIMARY KEY,
            nip TEXT NOT NULL UNIQUE,
            nama TEXT NOT NULL DEFAULT '',
            password TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_nip ON jobs(nip);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_nip ON jobs(nip);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_active_nip ON jobs(nip) WHERE status IN ('pending','running');
        CREATE INDEX IF NOT EXISTS idx_scrape_targets_nip ON scrape_targets(nip);
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
}
