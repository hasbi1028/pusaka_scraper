import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || './data/pusaka.db';
const BACKUP_DIR = './backup';

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

function exportData() {
    console.log('Exporting accounts (scrape_targets) and users...');
    
    const targets = db.prepare('SELECT id, nip, nama, password, created_at, updated_at FROM scrape_targets').all();
    const users = db.prepare('SELECT id, username, password_hash, role, created_at, updated_at FROM users').all();
    
    const data = {
        exported_at: new Date().toISOString(),
        scrape_targets: targets,
        users: users
    };
    
    const filePath = path.join(BACKUP_DIR, `pusaka_export_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    // Also update a "latest" symlink or copy for easy access
    fs.writeFileSync(path.join(BACKUP_DIR, 'latest_accounts.json'), JSON.stringify(data, null, 2));
    
    console.log(`Success! Data exported to ${filePath}`);
    console.log(`Latest copy updated at ${path.join(BACKUP_DIR, 'latest_accounts.json')}`);
}

function importData(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error('Error: Please provide a valid JSON file path.');
        process.exit(1);
    }
    
    console.log(`Importing data from ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    const insertTarget = db.prepare(`
        INSERT INTO scrape_targets (id, nip, nama, password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(nip) DO UPDATE SET
            nama = excluded.nama,
            password = excluded.password,
            updated_at = CURRENT_TIMESTAMP
    `);
    
    const insertUser = db.prepare(`
        INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO NOTHING
    `);
    
    const transaction = db.transaction((data) => {
        let targetCount = 0;
        let userCount = 0;
        
        if (data.scrape_targets) {
            for (const t of data.scrape_targets) {
                insertTarget.run(t.id, t.nip, t.nama, t.password, t.created_at, t.updated_at);
                targetCount++;
            }
        }
        
        if (data.users) {
            for (const u of data.users) {
                insertUser.run(u.id, u.username, u.password_hash, u.role, u.created_at, u.updated_at);
                userCount++;
            }
        }
        
        return { targetCount, userCount };
    });
    
    try {
        const result = transaction(data);
        console.log(`Import successful!`);
        console.log(`- Scrape Targets: ${result.targetCount} processed (inserted/updated)`);
        console.log(`- Users: ${result.userCount} processed (inserted/skipped)`);
    } catch (err) {
        console.error('Import failed:', err.message);
    }
}

const command = process.argv[2];
const arg = process.argv[3];

if (command === 'export') {
    exportData();
} else if (command === 'import') {
    importData(arg || path.join(BACKUP_DIR, 'latest_accounts.json'));
} else {
    console.log('Usage: node scripts/backup_restore.js [export|import] [file_path]');
}
