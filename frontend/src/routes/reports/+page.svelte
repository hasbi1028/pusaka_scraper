<script>
  import { onMount } from 'svelte';
  import { SESSION_EXPIRED, apiFetch, clearTokens, getTokens } from '$lib/auth/client';

  let token = $state('');
  let jobs = $state([]);
  let stats = $state(null);
  let statusFilter = $state('');
  let searchQuery = $state(''); // Fitur Pencarian
  let loading = $state(false);
  let errorMsg = $state('');

  let captureMode = $state(false);
  let reportsSortKey = $state('updated_at');
  let reportsSortDir = $state('desc');

  function normalizeValue(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function compareByKey(a, b, key, dir) {
    const av = normalizeValue(a?.[key]);
    const bv = normalizeValue(b?.[key]);

    // Sorting khusus untuk waktu/tanggal
    if (key === 'updated_at') {
      const at = av ? new Date(av).getTime() : -Infinity;
      const bt = bv ? new Date(bv).getTime() : -Infinity;
      if (at !== bt) return dir === 'asc' ? at - bt : bt - at;
      return 0;
    }

    const al = av.toLowerCase();
    const bl = bv.toLowerCase();
    if (!al && !bl) return 0;
    if (!al) return 1;
    if (!bl) return -1;
    if (al < bl) return dir === 'asc' ? -1 : 1;
    if (al > bl) return dir === 'asc' ? 1 : -1;
    return 0;
  }

  function toggleSort(key) {
    if (reportsSortKey === key) {
      reportsSortDir = reportsSortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    reportsSortKey = key;
    reportsSortDir = 'asc'; // Default asc untuk kolom baru
    if (key === 'updated_at') reportsSortDir = 'desc';
  }

  function sortIndicator(key) {
    if (reportsSortKey !== key) return '↕';
    return reportsSortDir === 'asc' ? '▲' : '▼';
  }

  // Logika Filter & Search
  const filteredJobs = $derived.by(() => {
    let list = [...(jobs || [])];
    
    // Filter Search (NIP atau Nama)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(j => 
        (j.nama?.toLowerCase().includes(q)) || 
        (j.nip?.includes(q))
      );
    }

    // Sortir
    return list.sort((a, b) => compareByKey(a, b, reportsSortKey, reportsSortDir));
  });

  function fmtDate(v) {
    if (!v) return '-';
    const cleanStr = v.replace(' ', 'T').includes('Z') ? v : v.replace(' ', 'T') + 'Z';
    const d = new Date(cleanStr);
    
    // Gunakan format manual atau opsi ketat untuk menghindari label WITA otomatis
    const time = d.toLocaleTimeString('id-ID', { 
      timeZone: 'Asia/Makassar', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    const date = d.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      day: 'numeric',
      month: 'short'
    });
    
    return `${date}, ${time}`;
  }

  async function copyCaption() {
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' });
    const cap = `Laporan Scrape (${now})\nTotal: ${stats?.total ?? 0}\nSuccess: ${stats?.success ?? 0}\nFailed: ${stats?.failed ?? 0}`;
    try {
      await navigator.clipboard.writeText(cap);
      alert('Caption berhasil disalin!');
    } catch {
      alert('Gagal menyalin caption.');
    }
  }

  async function loadReport() {
    if (!token) return;
    loading = true;
    errorMsg = '';
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}&limit=1000` : '?limit=1000';
      const [j, s] = await Promise.all([
        apiFetch(`/api/v1/admin/jobs${query}`),
        apiFetch('/api/v1/admin/jobs/stats')
      ]);
      jobs = j.items || [];
      stats = s;
    } catch (err) {
      if (String(err?.message || '') === SESSION_EXPIRED) {
        errorMsg = 'Sesi habis, silakan login kembali.';
      } else {
        errorMsg = String(err?.message || 'Gagal memuat laporan');
      }
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    token = getTokens().accessToken || '';
    if (!token) return;
    await loadReport();
  });
</script>

<section class="report-wrap" class:capture-mode={captureMode}>
  <div class="card report-card">
    <header class="head">
      <div class="title-group">
        <h1>Laporan Hasil Scrape</h1>
        <p class="muted">Pemantauan data presensi seluruh pegawai.</p>
      </div>
      <div class="stamp-group">
        <p class="stamp">Dibuat: {fmtDate(new Date().toISOString())}</p>
        <span class="badge badge-success">Live Report</span>
      </div>
    </header>

    <!-- Kontrol Filter & Search -->
    <div class="controls capture-hide">
      <div class="search-box">
        <input 
          id="search-report"
          type="text" 
          placeholder="Cari Nama / NIP..." 
          bind:value={searchQuery}
          class="search-input"
        />
      </div>
      <div class="filter-group">
        <label for="status-filter">Status:</label>
        <select id="status-filter" bind:value={statusFilter} onchange={loadReport} class="compact-select">
          <option value="">Semua</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div class="action-buttons">
        <button class="btn-primary" onclick={loadReport} disabled={loading}>
          {loading ? '...' : '🔄 Refresh'}
        </button>
        <button class="btn-secondary" onclick={() => (captureMode = !captureMode)}>
          📸 Screenshot
        </button>
        <button class="btn-secondary" onclick={copyCaption}>📋 Caption</button>
      </div>
    </div>

    {#if errorMsg}
      <div class="alert alert-error capture-hide">{errorMsg}</div>
    {/if}

    <div class="stats-overview">
      <div class="stat-item"><strong>Total:</strong> {stats?.total ?? 0}</div>
      <div class="stat-item"><strong>Success:</strong> <span class="text-green">{stats?.success ?? 0}</span></div>
      <div class="stat-item"><strong>Failed:</strong> <span class="text-red">{stats?.failed ?? 0}</span></div>
      <div class="stat-item"><strong>Pending:</strong> {stats?.pending ?? 0}</div>
    </div>

    <div class="table-container">
      <table class="report-table">
        <thead>
          <tr>
            <th width="40">No</th>
            <th><button class="sort-btn" onclick={() => toggleSort('nama')}>Pegawai {sortIndicator('nama')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('status')}>Status {sortIndicator('status')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('jam_masuk')}>Masuk {sortIndicator('jam_masuk')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('jam_pulang')}>Pulang {sortIndicator('jam_pulang')}</button></th>
            <th class="capture-hide"><button class="sort-btn" onclick={() => toggleSort('updated_at')}>Update {sortIndicator('updated_at')}</button></th>
          </tr>
        </thead>
        <tbody>
          {#if filteredJobs.length === 0}
            <tr><td colspan="6" class="text-center">Data tidak ditemukan</td></tr>
          {:else}
            {#each filteredJobs as job, rowIndex (job.id)}
              <tr class:row-failed={job.status === 'failed'}>
                <td class="text-muted">{rowIndex + 1}</td>
                <td>
                  <div class="name-col">
                    <span class="name">{job.nama || '-'}</span>
                    <span class="nip text-muted">{job.nip}</span>
                  </div>
                </td>
                <td>
                  <span class="badge badge-{job.status}">{job.status}</span>
                </td>
                <td class="font-mono">{(job.jam_masuk || '--:--').replace(' WITA', '')}</td>
                <td class="font-mono">{(job.jam_pulang || '--:--').replace(' WITA', '')}</td>
                <td class="capture-hide text-muted font-small">{new Date(job.updated_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', {timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit'})}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#if captureMode}
      <div class="capture-footer-actions">
        <a href="/dashboard" class="action-btn btn-blue">🏠 Dashboard</a>
        <button class="action-btn btn-red" onclick={() => (captureMode = false)}>❌ Keluar</button>
      </div>
    {/if}
  </div>
</section>

<style>
  .report-wrap { max-width: 950px; margin: 0 auto; transition: all 0.3s; }
  .report-card { background: #18181b; padding: 24px; display: flex; flex-direction: column; gap: 20px; border: 1px solid #27272a; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #27272a; padding-bottom: 16px; }
  h1 { font-size: 24px; margin: 0; color: white; }
  .muted { font-size: 14px; color: #a1a1aa; margin: 4px 0 0; }
  .stamp-group { text-align: right; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
  .stamp { font-size: 12px; color: #71717a; margin: 0; }

  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; background: #09090b; padding: 16px; border-radius: 12px; gap: 12px; border: 1px solid #27272a; }
  .search-input { background: #18181b; border: 1px solid #27272a; color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; width: 200px; }
  .filter-group { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #a1a1aa; }
  .action-buttons { display: flex; gap: 8px; }
  .compact-select { background: #18181b; color: white; padding: 6px 10px; border-radius: 8px; border: 1px solid #27272a; font-size: 13px; }

  .stats-overview { display: flex; gap: 24px; padding: 0 4px; font-size: 13px; color: #a1a1aa; }
  .text-green { color: #10b981; font-weight: 700; }
  .text-red { color: #f87171; font-weight: 700; }

  .table-container { border: 1px solid #27272a; border-radius: 12px; overflow: hidden; background: #09090b; }
  .report-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #e4e4e7; }
  .report-table th { background: #18181b; color: #a1a1aa; font-weight: 600; text-align: left; padding: 14px 12px; border-bottom: 1px solid #27272a; }
  .report-table td { padding: 12px; border-bottom: 1px solid #27272a; }
  .report-table tr:hover { background: #1c1c21; }

  .name-col { display: flex; flex-direction: column; }
  .name-col .name { font-weight: 600; color: white; }
  .name-col .nip { font-size: 11px; color: #71717a; }
  .font-mono { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 14px; }
  .font-small { font-size: 11px; }
  .text-muted { color: #71717a; }
  .text-center { text-align: center; }

  .sort-btn { border: none; background: transparent; padding: 0; font: inherit; font-weight: inherit; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .alert-error { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 13px; }

  /* CAPTURE MODE - ULTRA THIN */
  .capture-mode { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; background: #09090b; max-width: none; overflow-y: auto; padding: 0; }
  .capture-mode .capture-hide { display: none !important; }
  .capture-mode .report-card { padding: 5px; border-radius: 0; border: none; width: 100%; max-width: 400px; margin: 0 auto; background: #09090b; gap: 5px; }
  .capture-mode h1 { font-size: 14px; color: white; margin: 0; }
  .capture-mode .head { padding-bottom: 5px; margin-bottom: 5px; border-bottom-width: 1px; }
  .capture-mode .stamp { font-size: 9px; }
  .capture-mode .stats-overview { gap: 10px; font-size: 10px; margin-bottom: 5px; }

  .capture-mode .report-table { font-size: 9px; line-height: 1; }
  .capture-mode .report-table th { padding: 2px 4px; font-size: 8px; background: #18181b; }
  .capture-mode .report-table td { padding: 1px 4px; height: 18px; border-bottom-color: #1c1c21; }
  .capture-mode .name-col .name { font-size: 9px; font-weight: 700; }
  .capture-mode .name-col .nip { display: none; }
  .capture-mode .font-mono { font-size: 9px; font-weight: 800; }
  .capture-mode .badge { font-size: 7px; padding: 0px 3px; border-radius: 2px; }
  .capture-mode .text-muted { font-size: 8px; }

  .capture-footer-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 20px 0;
    border-top: 1px dashed #27272a;
    margin-top: 10px;
  }

  .action-btn { 
    padding: 12px 24px; 
    border-radius: 12px; 
    font-weight: 800; 
    font-size: 14px; 
    text-decoration: none; 
    border: none; 
    cursor: pointer; 
    color: white;
    transition: background 0.2s;
  }
  .btn-red { background: #f87171; }
  .btn-blue { background: #3b82f6; }
  .btn-red:hover { background: #ef4444; }
  .btn-blue:hover { background: #2563eb; }

  @media (max-width: 768px) {
    .controls { flex-direction: column; align-items: stretch; }
    .search-input { width: 100%; }
    .action-buttons { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  }
</style>
