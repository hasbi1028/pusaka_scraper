# Pusaka Scraper (SvelteKit + Bun Worker)

Aplikasi full-stack untuk manajemen dan otomatisasi scraping data kehadiran "Pusaka" dengan dashboard admin real-time.

## Arsitektur Modern

- **Frontend & API**: SvelteKit (Node.js) + SQLite (`better-sqlite3`) + SSE (Server-Sent Events).
- **Worker**: Bun + Playwright (untuk scraping headless/headed).
- **Deployment**: Mendukung Phusion Passenger (Cloud Hosting/VPS) & PM2 (Windows/Linux).

```text
[Browser User] <--> [SvelteKit API & UI] <--> [SQLite DB]
                            ^
                            | (HTTP/SSE)
                            v
                     [Bun Worker Scraper]
```

## Fitur Utama

- ✅ **Full-Stack SvelteKit**: API dan Dashboard dalam satu aplikasi.
- ✅ **Real-time Dashboard**: Pantau progress worker secara live via SSE.
- ✅ **Screenshot Capture**: Worker otomatis mengambil bukti screenshot saat berhasil.
- ✅ **Worker Control**: Pengaturan concurrency dan mode headless langsung dari UI.
- ✅ **Backup & Restore**: Export/Import data akun via JSON dan backup database.
- ✅ **Mobile Responsive**: UI modern dengan Dark Mode.

## Panduan Instalasi (Lokal)

### 1. Prasyarat
- Node.js (v20+)
- Bun (untuk Worker)
- SQLite3

### 2. Setup Dependensi
Gunakan `Makefile` untuk instalasi cepat:
```bash
make install
npm install  # Install tool backup & PM2 config di root
```

### 3. Environment Variables (.env)
Buat file `.env` di dalam folder `frontend/`:
```bash
ORIGIN=http://localhost:5173
DB_PATH=../data/pusaka.db
JWT_SECRET=rahasia-anda
WORKER_TOKEN=token-keamanan-worker
```

### 4. Menjalankan Aplikasi
Jalankan Frontend dan Worker secara paralel:
```bash
make dev
```
- UI/API: `http://localhost:5173`
- Worker: Berjalan di background (Bun)

---

## Panduan Deployment (Production)

### A. VPS / Phusion Passenger (Linux)
Aplikasi ini sudah dikonfigurasi untuk deployment di lingkungan shared hosting/VPS yang menggunakan Phusion Passenger.

1.  **Build Frontend**: `cd frontend && npm run build`
2.  **Konfigurasi Passenger**:
    - **Startup File**: `passenger_entry_point.js`
    - **App Root**: Folder utama proyek.
3.  **Environment**: Pastikan `NODE_ENV=production` diatur di panel hosting.

### B. Windows / PM2
Untuk menjalankan di Windows sebagai background service:

1.  **Install PM2**: `npm install -g pm2`
2.  **Build Frontend**: `cd frontend && npm run build`
3.  **Jalankan dengan PM2**:
    ```bash
    pm2 start ecosystem.config.cjs
    ```
4.  **Auto-start saat Windows Boot**:
    ```powershell
    npm install -g pm2-windows-startup
    pm2-startup install
    pm2 save
    ```

---

## Backup & Restore Data

Gunakan perintah `make` untuk mengelola data akun Anda:

| Perintah | Deskripsi |
| :--- | :--- |
| `make export-accounts` | Export semua user dan target scrape ke `backup/` (JSON). |
| `make import-accounts` | Import/Restore data dari JSON terbaru ke database. |
| `make backup-db` | Salin database SQLite utuh ke folder `backup/`. |
| `make restore-db FILE=path` | Restore database dari file `.db` tertentu. |

---

## Struktur Folder

- `frontend/`: Source code SvelteKit (UI + API).
- `src/`: Source code Worker (TypeScript).
- `data/`: Lokasi database SQLite (diabaikan oleh Git).
- `backup/`: Lokasi hasil export dan backup (diabaikan oleh Git).
- `scripts/`: Script utilitas (backup/restore).
- `passenger_entry_point.js`: Entry point khusus untuk production/Passenger.
- `ecosystem.config.cjs`: Konfigurasi khusus untuk PM2 (Windows/Linux).

## Lisensi
MIT
