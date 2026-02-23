# Pusaka Stack (Custom Backend + Frontend + Worker)

Monorepo ini sekarang terdiri dari 3 komponen utama:

- `backend/`: API + job orchestration (`Go + Fiber + SQLite + JWT`)
- `frontend/`: dashboard admin (`SvelteKit`)
- `src/`: worker scraper (`Bun + Playwright`) yang claim job dari backend

## Arsitektur

```text
[SvelteKit Dashboard] ---> [Go Backend API + SQLite] <--- [Worker TS Playwright]
                                  |                          |
                                  |<-- claim/heartbeat ------|
```

## 1) Backend (Go)

### Environment

Buat environment berikut sebelum menjalankan backend:

```bash
APP_ADDR=:8080
DB_PATH=./data/pusaka.db
JWT_SECRET=change-this-jwt-secret
ENC_KEY=0123456789abcdef0123456789abcdef
WORKER_TOKEN=change-this-worker-token
ACCESS_TTL_MIN=60
REFRESH_TTL_DAYS=14
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
```

`ENC_KEY` harus 32 karakter (AES-256 key).

### Run

```bash
cd backend
go run ./cmd/server
```

API utama:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/admin/jobs`
- `GET /api/v1/admin/jobs/stats`
- `GET /api/v1/admin/jobs/:id`
- `POST /api/v1/admin/jobs`
- `POST /api/v1/admin/jobs/:id/retry`
- `GET /api/v1/admin/targets`
- `GET /api/v1/admin/targets/:id`
- `POST /api/v1/admin/targets`
- `PUT /api/v1/admin/targets/:id`
- `DELETE /api/v1/admin/targets/:id`
- `POST /api/v1/admin/targets/:id/enqueue`
- `POST /api/v1/worker/jobs/claim`
- `POST /api/v1/worker/jobs/:id/heartbeat`
- `POST /api/v1/worker/jobs/:id/success`
- `POST /api/v1/worker/jobs/:id/fail`

## 2) Worker (Bun + Playwright)

Worker membaca job dari backend, menjalankan scraper, lalu report hasil.

### Environment

```bash
API_BASE_URL=http://localhost:8080
WORKER_TOKEN=change-this-worker-token
WORKER_ID=worker-1
CONCURRENCY=4
HEARTBEAT=17000
IDLE_POLL_MS=1500
```

### Run

```bash
bun install
bun run worker:start
```

## 3) Frontend (SvelteKit)

### Environment

```bash
VITE_API_BASE_URL=http://localhost:8080
```

### Run

```bash
cd frontend
npm install
npm run dev
```

## Catatan Migrasi dari PocketBase

- PocketBase tidak lagi dipakai untuk orchestration.
- Data job sekarang disimpan di SQLite backend.
- Scraper Playwright tetap dipakai (tanpa rewrite logic scraping).
- Model deploy yang disasar: single VPS untuk MVP.
- Satu NIP hanya boleh punya satu job aktif (`pending/running`) pada satu waktu.
- Retry bersifat manual lewat endpoint/admin dashboard, tidak auto-retry saat gagal.
- Proses scrape bersifat manual (enqueue oleh user), bukan auto-scheduled.
