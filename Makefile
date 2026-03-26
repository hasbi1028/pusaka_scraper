SHELL := /bin/bash

.PHONY: help install install-worker install-frontend dev worker frontend clean \
	backup-data export-accounts import-accounts backup-db restore-db

help:
	@echo "Pusaka Scraper - Unified Management"
	@echo "Available targets:"
	@echo "  make install          - Install all dependencies (Frontend & Worker)"
	@echo "  make dev              - Run SvelteKit (Backend+UI) and Worker in parallel"
	@echo "  make worker           - Run Bun worker only"
	@echo "  make frontend         - Run SvelteKit dev server only"
	@echo "  make export-accounts  - Export users and accounts to JSON in backup/"
	@echo "  make import-accounts  - Import users and accounts from JSON (default: latest_accounts.json)"
	@echo "  make backup-db        - Create a full copy of SQLite database to backup/"
	@echo "  make clean            - Remove build artifacts and temporary files"

install: install-worker install-frontend

install-worker:
	@echo "Installing worker dependencies..."
	@bun install

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

worker:
	@echo "Starting worker (watch mode)..."
	@if [ -f .env.worker ]; then \
		set -a; source .env.worker; set +a; \
	fi; \
	bun run worker:dev

worker-prod:
	@echo "Starting worker (production mode)..."
	@if [ -f .env.worker ]; then \
		set -a; source .env.worker; set +a; \
	fi; \
	bun run worker:start

frontend:
	@echo "Starting SvelteKit frontend (Backend + UI)..."
	@cd frontend && npm run dev

dev:
	@echo "Launching development environment..."
	@set -e; \
	trap 'kill 0' EXIT; \
	$(MAKE) frontend & \
	$(MAKE) worker & \
	wait

# --- Backup & Restore Section ---

export-accounts:
	@node scripts/backup_restore.js export

import-accounts:
	@node scripts/backup_restore.js import $(FILE)

backup-db:
	@mkdir -p backup
	@if [ -f data/pusaka.db ]; then \
		cp data/pusaka.db backup/pusaka_$(shell date +%F_%H-%M-%S).db; \
		echo "Database backed up to backup/ folder"; \
	else \
		echo "Error: data/pusaka.db not found"; \
	fi

restore-db:
	@if [ -z "$(FILE)" ]; then \
		echo "Error: Please specify FILE=path/to/backup.db"; \
		exit 1; \
	fi; \
	cp $(FILE) data/pusaka.db; \
	echo "Database restored from $(FILE)"

# Alias for backward compatibility
backup-data: export-accounts backup-db

clean:
	@echo "Cleaning up..."
	@rm -rf frontend/.svelte-kit frontend/build
	@rm -rf node_modules frontend/node_modules
	@echo "Done."
