package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func Open(dbPath string) (*sql.DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL;`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA busy_timeout=5000;`); err != nil {
		return nil, err
	}
	return db, nil
}

func Migrate(db *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS refresh_tokens (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			token_hash TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			revoked_at DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			nip TEXT NOT NULL,
			nama TEXT NOT NULL DEFAULT '',
			password_encrypted TEXT NOT NULL,
			tanggal TEXT NOT NULL DEFAULT '',
			jam_masuk TEXT NOT NULL DEFAULT '',
			jam_pulang TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			retry INTEGER NOT NULL DEFAULT 0,
			error TEXT NOT NULL DEFAULT '',
			heartbeat_at DATETIME,
			progress_age_ms INTEGER NOT NULL DEFAULT 0,
			duration_ms INTEGER NOT NULL DEFAULT 0,
			claimed_by TEXT NOT NULL DEFAULT '',
			claimed_at DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS scrape_targets (
			id TEXT PRIMARY KEY,
			nip TEXT NOT NULL UNIQUE,
			nama TEXT NOT NULL DEFAULT '',
			password_encrypted TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_nip ON jobs(nip);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_active_nip ON jobs(nip) WHERE status IN ('pending','running');`,
		`CREATE INDEX IF NOT EXISTS idx_scrape_targets_nip ON scrape_targets(nip);`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}
	return nil
}
