# 📘 Pusaka Presence Scraper

**Runtime:** Bun  
**Architecture:** Event-driven Scraper Orchestrator (PocketBase + Playwright)  
**Status:** Production-ready (single worker)

---

## 1. Overview

Pusaka Presence Scraper adalah sistem **scraper presensi berbasis event (SSE)** untuk mengambil data presensi harian dari sistem **Pusaka Kemenag** secara:

- Stabil
- Aman dari race condition
- Tahan UI change minor
- Siap jalan 24/7

Sistem ini **tidak menggunakan polling**, melainkan **PocketBase Realtime (SSE)** sebagai job trigger.

---

## 2. High-Level Architecture

```
[ PocketBase (jobs) ]
          │
          │  SSE (realtime update)
          ▼
[ Orchestrator (Bun) ]
          │
          │  Queue + Concurrency
          ▼
[ Scraper Worker ]
          │
          ▼
[ Browser Pool (Playwright) ]
```

---

## 3. Components

### 3.1 Orchestrator

- Subscribe SSE PocketBase
- Queue in-memory
- Concurrency control
- Heartbeat & recovery
- Retry logic
- Job deduplication

### 3.2 Scraper v1.5

- Playwright + Chromium
- Stealth mode
- Human-like delay
- Session persistence
- Error classification
- Progress callback (`onProgress`)

---

## 4. Runtime Requirements

| Dependency | Version            |
| ---------- | ------------------ |
| Bun        | >= 1.0             |
| Playwright | Latest             |
| PocketBase | >= 0.22            |
| Chromium   | Playwright bundled |

---

## 5. Installation

### 5.1 Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 5.2 Install Dependencies

```bash
bun install
```

### 5.3 Install Playwright Browser

```bash
bunx playwright install chromium
```

---

## 6. Project Structure

```
.
├── orchestrator.ts        # SSE worker & queue
├── scraper.ts             # Scraper v1.5
├── browserPools.ts        # Shared browser instance
├── state/                 # Login session per user
├── locks/                 # Optional user lock
└── README.md
```

---

## 7. Running the Worker

```bash
bun run orchestrator.ts
```

---

## 8. Concurrency & Performance

| Setting            | Default |
| ------------------ | ------- |
| Max concurrency    | 8       |
| Retry per job      | 3       |
| Heartbeat interval | 5s      |
| Stale recovery     | 30s     |

---

## 9. Job Lifecycle

```
pending → running → success
              ↘
               failed
```

---

## 10. Error Handling Strategy

| Error Type   | Retry |
| ------------ | ----- |
| TIMEOUT      | ✅    |
| SELECTOR     | ✅    |
| LOGIN_FAILED | ❌    |
| BLOCKED      | ❌    |
| UNKNOWN      | ❌    |

---

## 11. PocketBase Collection: `pusaka`

| Field           | Type     | Description                          |
| --------------- | -------- | ------------------------------------ |
| nip             | string   | NIP user                             |
| nama            | string   | Nama pegawai                         |
| password        | string   | Password login                       |
| tanggal         | string   | Tanggal presensi                     |
| jam_masuk       | string   | Jam masuk                            |
| jam_pulang      | string   | Jam pulang                           |
| status          | enum     | pending / running / success / failed |
| retry           | number   | Retry count                          |
| error           | string   | Error message                        |
| heartbeat       | datetime | Last heartbeat                       |
| progress_age_ms | number   | Progress age                         |
| duration_ms     | number   | Execution duration                   |

---

## 12. Heartbeat & Monitoring

Monitoring rule:

- `progress_age_ms > 30000` → job dianggap **stuck**

---

## 13. Scraper API (Internal)

```ts
scrapeUser({
  nip: string;
  password: string;
  onProgress?: () => void;
})
```

---

## 14. Bun Runtime Notes

- Bun menjalankan TypeScript tanpa transpile
- SSE membutuhkan polyfill EventSource

---

## 15. Operational Best Practices

- Jalankan sebagai service
- Backup folder `state/`
- Monitor heartbeat
- Jangan share satu akun di banyak worker

---

**End of README**
