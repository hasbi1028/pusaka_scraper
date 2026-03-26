<script>
  import { onMount } from 'svelte';
  import { SESSION_EXPIRED, apiFetch, getTokens } from '$lib/auth/client';

  // --- STATES ---
  let token = $state('');
  let jobs = $state([]);
  let stats = $state(null);
  let statusFilter = $state('');
  let searchQuery = $state('');
  let loading = $state(false);
  let errorMsg = $state('');
  let workTimeStart = $state('07:30');
  let workTimeEnd = $state('16:00');

  let captureMode = $state(false);
  let sortKey = $state('nip'); // Default sort NIP for reports
  let sortDir = $state('asc');
  let savedSort = null;

  // --- HELPERS ---
  function normalizeValue(v) { if (v === null || v === undefined) return ''; return String(v).trim(); }

  function compareByKey(a, b, key, dir) {
    let av = normalizeValue(a?.[key]);
    let bv = normalizeValue(b?.[key]);
    if (key === 'updated_at') {
      const at = av ? new Date(av.replace(' ', 'T') + 'Z').getTime() : -Infinity;
      const bt = bv ? new Date(bv.replace(' ', 'T') + 'Z').getTime() : -Infinity;
      return dir === 'asc' ? at - bt : bt - at;
    }
    av = av.toLowerCase(); bv = bv.toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  }

  function toggleSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
  }

  function sortIndicator(key) { 
    if (captureMode) return ''; // Sembunyikan panah saat screenshot
    if (sortKey !== key) return '↕'; 
    return sortDir === 'asc' ? '▲' : '▼'; 
  }

  function isToday(dateStr) {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      return d.toDateString() === new Date().toDateString();
    } catch { return false; }
  }

  // Fungsi pembersihan jam yang lebih kuat
  function cleanTimeText(val) {
    if (!val || ['','-','--:--'].includes(String(val).trim())) return '--:--';
    // Hanya ambil angka dan titik dua, hapus WITA, AM, PM, dll
    const cleaned = String(val).replace(/[^0-9:]/g, "").trim();
    return cleaned || '--:--';
  }

  function getStatusWaktu(jam, type) {
    const t = cleanTimeText(jam);
    if (t === '--:--') return 'missing';
    if (type === 'in') return t > workTimeStart ? 'late' : 'ontime';
    return t < workTimeEnd ? 'early' : 'ontime';
  }

  // --- LOGIC ---
  function toggleCapture() {
    if (!captureMode) {
      savedSort = { key: sortKey, dir: sortDir };
      sortKey = 'nip'; sortDir = 'asc';
      captureMode = true;
    } else {
      if (savedSort) { sortKey = savedSort.key; sortDir = savedSort.dir; }
      captureMode = false;
    }
  }

  const filteredJobs = $derived.by(() => {
    let list = [...(jobs || [])];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(j => (j.nama?.toLowerCase().includes(q)) || (j.nip?.includes(q)));
    }
    return list.sort((a, b) => compareByKey(a, b, sortKey, sortDir));
  });

  function fmtHeaderDate() {
    const d = new Date();
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + 
           d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  async function loadReport() {
    if (!token) return;
    loading = true; errorMsg = '';
    try {
      const query = new URLSearchParams({ limit: '1000' });
      if (statusFilter) query.set('status', statusFilter);
      const [j, s, set] = await Promise.all([
        apiFetch(`/api/v1/admin/jobs?${query.toString()}`),
        apiFetch('/api/v1/admin/jobs/stats'),
        apiFetch('/api/v1/admin/settings')
      ]);
      jobs = j.items || []; stats = s;
      workTimeStart = set.workTimeStart || '07:30';
      workTimeEnd = set.workTimeEnd || '16:00';
    } catch (err) { errorMsg = 'Gagal memuat data'; } finally { loading = false; }
  }

  onMount(async () => {
    token = getTokens().accessToken || '';
    if (token) await loadReport();
  });
</script>

<section class="report-wrap" class:capture-mode={captureMode}>
  <div class="card report-card">
    <header class="head">
      <div class="title-group">
        <h1>Laporan Hasil Scrape</h1>
        <p class="muted">Pemantauan data presensi pegawai.</p>
      </div>
      <div class="stamp-group">
        <p class="stamp">Dibuat: {fmtHeaderDate()}</p>
        <span class="badge badge-success">Live Report</span>
      </div>
    </header>

    <div class="controls capture-hide">
      <input placeholder="Cari Nama / NIP..." bind:value={searchQuery} class="search-input" />
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
        <button class="btn-primary" onclick={loadReport} disabled={loading}>{loading ? '...' : '🔄 Refresh'}</button>
        <button class="btn-secondary" onclick={toggleCapture}>📸 Screenshot</button>
      </div>
    </div>

    <div class="stats-overview">
      <div class="stat-item"><strong>Total:</strong> {stats?.total ?? 0}</div>
      <div class="stat-item"><strong>Success:</strong> <span class="text-green">{stats?.success ?? 0}</span></div>
      <div class="stat-item"><strong>Failed:</strong> <span class="text-red">{stats?.failed ?? 0}</span></div>
    </div>

    <div class="table-container">
      <table class="report-table">
        <thead>
          <tr>
            <th width="35"><button class="sort-btn" onclick={() => toggleSort('nip')}>No {sortIndicator('nip')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('nama')}>Pegawai {sortIndicator('nama')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('status')}>Status {sortIndicator('status')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('jam_masuk')}>Masuk {sortIndicator('jam_masuk')}</button></th>
            <th><button class="sort-btn" onclick={() => toggleSort('jam_pulang')}>Pulang {sortIndicator('jam_pulang')}</button></th>
            <th class="capture-hide"><button class="sort-btn" onclick={() => toggleSort('updated_at')}>Update {sortIndicator('updated_at')}</button></th>
          </tr>
        </thead>
        <tbody>
          {#each filteredJobs as job, i (job.id)}
            <tr>
              <td class="text-muted">{i + 1}</td>
              <td>
                <div class="name-col">
                  <span class="name">{job.nama || '-'}</span>
                  <span class="nip text-muted">{job.nip}</span>
                </div>
              </td>
              <td><span class="badge badge-{job.status}">{job.status}</span></td>
              <td>
                <span class="time-box-mini status-{getStatusWaktu(job.jam_masuk, 'in')}">
                  {cleanTimeText(job.jam_masuk)}
                  {#if getStatusWaktu(job.jam_masuk, 'in') === 'missing' && isToday(job.updated_at)} ❗{/if}
                </span>
              </td>
              <td>
                <span class="time-box-mini status-{getStatusWaktu(job.jam_pulang, 'out')}">
                  {cleanTimeText(job.jam_pulang)}
                  {#if getStatusWaktu(job.jam_pulang, 'out') === 'missing' && isToday(job.updated_at)} ❗{/if}
                </span>
              </td>
              <td class="capture-hide text-muted font-small">
                {new Date(job.updated_at.replace(' ','T')+'Z').toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
              </td>
            </tr>
          {:else}
            <tr><td colspan="6" class="text-center">Data tidak ditemukan</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if captureMode}
      <div class="capture-footer-actions">
        <a href="/dashboard" class="action-btn btn-blue">🏠 Dashboard</a>
        <button class="action-btn btn-red" onclick={toggleCapture}>❌ Keluar</button>
      </div>
    {/if}
  </div>
</section>

<style>
  .report-wrap { max-width: 950px; margin: 0 auto; transition: all 0.3s; }
  .report-card { background: #18181b; padding: 24px; display: flex; flex-direction: column; gap: 20px; border: 1px solid #27272a; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #27272a; padding-bottom: 16px; }
  h1 { font-size: 20px; margin: 0; color: white; }
  .muted { font-size: 13px; color: #a1a1aa; }
  .stamp { font-size: 11px; color: #71717a; margin: 0; }

  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; background: #09090b; padding: 12px; border-radius: 12px; gap: 12px; border: 1px solid #27272a; }
  .search-input { background: #18181b; border: 1px solid #27272a; color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; width: 200px; }
  .filter-group { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #a1a1aa; }
  .compact-select { background: #18181b; color: white; padding: 6px; border-radius: 8px; border: 1px solid #27272a; }

  .stats-overview { display: flex; gap: 20px; font-size: 12px; color: #a1a1aa; }
  .text-green { color: #10b981; } .text-red { color: #f87171; }

  .table-container { border: 1px solid #27272a; border-radius: 12px; overflow: hidden; background: #09090b; }
  .report-table { width: 100%; border-collapse: collapse; font-size: 12px; color: #e4e4e7; }
  .report-table th { background: #18181b; color: #a1a1aa; padding: 10px; text-align: left; border-bottom: 1px solid #27272a; font-size: 10px; text-transform: uppercase; }
  .report-table td { padding: 6px 10px; border-bottom: 1px solid #27272a; }

  .name-col .name { font-weight: 600; color: white; font-size: 12px; display: block; line-height: 1.2; }
  .name-col .nip { font-size: 10px; color: #71717a; }

  /* HIGHLIGHTS */
  .time-box-mini { padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 13px; }
  .status-late { background: rgba(248, 113, 113, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
  .status-early { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
  .status-ontime { background: rgba(16, 185, 129, 0.15); color: #10b981; }
  .status-missing { background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px dashed #ef4444; }
  .status-normal { color: #71717a; }

  .sort-btn { border: none; background: transparent; padding: 0; font: inherit; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 4px; }

  /* CAPTURE MODE - ULTRA THIN */
  .capture-mode { position: fixed; inset: 0; z-index: 9999; background: #09090b; overflow-y: auto; }
  .capture-mode .capture-hide { display: none !important; }
  .capture-mode .report-card { padding: 5px; width: 100%; max-width: 400px; margin: 0 auto; background: #09090b; border: none; gap: 5px; }
  .capture-mode .head { padding-bottom: 8px; margin-bottom: 5px; }
  .capture-mode h1 { font-size: 16px; }
  .capture-mode .stats-overview { margin-bottom: 5px; gap: 12px; }
  
  .capture-mode .report-table th { padding: 4px 8px; font-size: 9px; background: #18181b; }
  .capture-mode .report-table td { padding: 1px 8px; height: 18px; border-bottom-color: #1c1c21; }
  .capture-mode .name-col .name { font-size: 10px; }
  .capture-mode .name-col .nip { display: none; }
  .capture-mode .time-box-mini { font-size: 10px; padding: 0px 4px; border-radius: 2px; }

  .capture-footer-actions { display: flex; justify-content: center; gap: 12px; padding: 20px 0; border-top: 1px dashed #27272a; margin-top: 10px; }
  .action-btn { padding: 10px 20px; border-radius: 12px; font-weight: 800; font-size: 13px; text-decoration: none; color: white; }
  .btn-red { background: #f87171; } .btn-blue { background: #3b82f6; }

  @media (max-width: 768px) { .controls { flex-direction: column; align-items: stretch; } .search-input { width: 100%; } }
</style>
