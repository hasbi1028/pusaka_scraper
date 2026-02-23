SHELL := /bin/bash

.PHONY: help install install-backend install-worker install-frontend backend worker frontend dev clean

help:
	@echo "Available targets:"
	@echo "  make install          - Install all dependencies"
	@echo "  make install-backend  - Download Go modules for backend"
	@echo "  make install-worker   - Install Bun deps for worker"
	@echo "  make install-frontend - Install npm deps for frontend"
	@echo "  make backend          - Run Go backend (loads backend/.env.example as fallback)"
	@echo "  make worker           - Run Bun worker (loads .env.worker.example as fallback)"
	@echo "  make frontend         - Run SvelteKit frontend dev server"
	@echo "  make dev              - Run backend, worker, frontend in parallel"
	@echo "  make clean            - Remove local build/runtime artifacts"

install: install-backend install-worker install-frontend

install-backend:
	@cd backend && go mod tidy

install-worker:
	@bun install

install-frontend:
	@cd frontend && npm install

backend:
	@set -a; \
	[ -f backend/.env ] && source backend/.env || source backend/.env.example; \
	set +a; \
	cd backend && go run ./cmd/server

worker:
	@set -a; \
	[ -f .env.worker ] && source .env.worker || source .env.worker.example; \
	set +a; \
	bun run worker:start

frontend:
	@cd frontend && npm run dev

dev:
	@set -e; \
	trap 'kill 0' EXIT; \
	$(MAKE) backend & \
	$(MAKE) worker & \
	$(MAKE) frontend & \
	wait

clean:
	@rm -rf backend/data frontend/.svelte-kit frontend/build
