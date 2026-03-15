SHELL := /bin/bash

.PHONY: help install install-worker install-frontend dev worker frontend clean backup-data

help:
	@echo "Pusaka Scraper - Unified Management"
	@echo "Available targets:"
	@echo "  make install          - Install all dependencies (Frontend & Worker)"
	@echo "  make dev              - Run SvelteKit (Backend+UI) and Worker in parallel"
	@echo "  make worker           - Run Bun worker only"
	@echo "  make frontend         - Run SvelteKit dev server only"
	@echo "  make backup-data      - Backup SQLite data to backup/ folder"
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

backup-data:
	@echo "Creating backup..."
	@mkdir -p backup
	@if [ -f data/pusaka.db ]; then \
		sqlite3 data/pusaka.db ".mode json" "SELECT * FROM scrape_targets;" > backup/targets_backup_$(shell date +%F).json; \
		sqlite3 data/pusaka.db ".mode json" "SELECT * FROM jobs;" > backup/jobs_backup_$(shell date +%F).json; \
		cp data/pusaka.db backup/pusaka_$(shell date +%F).db; \
		echo "Backup successful: backup/ folder"; \
	else \
		echo "Error: data/pusaka.db not found"; \
	fi

clean:
	@echo "Cleaning up..."
	@rm -rf frontend/.svelte-kit frontend/build
	@rm -rf node_modules frontend/node_modules
	@echo "Done."
