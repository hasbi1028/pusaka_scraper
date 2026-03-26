<script>
  import { onMount } from 'svelte';
  import { apiFetch, getTokens, login as loginWithPassword } from '$lib/auth/client';

  // --- STATES ---
  let token = $state('');
  let username = $state('');
  let password = $state('');
  let loginError = $state('');
  let isLoggingIn = $state(false);
  let loading = $state(false);
  let searchQuery = $state('');
  let statusFilter = $state('');

  let targets = $state([]);
  let stats = $state(null);

  // Settings
  let headedMode = $state(false);
  let maxConcurrency = $state(5);
  let workTimeStart = $state('07:30');
  let workTimeEnd = $state('16:00');

  // Modal
  let isModalOpen = $state(false);
  let isEditing = $state(false);
  let viewScreenshotUrl = $state('');
  let editId = $state('');
  let targetNip = $state('');
  let targetNama = $state('');
  let targetPass = $state('');

  // Sorting
  let sortKey = $state('last_run');
  let sortDir = $state('desc');

  // --- LOGIC ---
  async function login() {
    if (!username || !password) { loginError = 'Wajib diisi'; return; }
    isLoggingIn = true;
    try {
      await loginWithPassword(username, password);
      token = getTokens().accessToken || '';
      await loadData();
    } catch (err) { loginError = 'Login gagal'; } finally { isLoggingIn = false; }
  }

  async function loadData() {
    loading = true;
    try {
      const qp = new URLSearchParams({ limit: '500' });
      if (statusFilter) qp.set('status', statusFilter);
      if (searchQuery) qp.set('q', searchQuery);

      const [tRes, sRes, setRes] = await Promise.all([
        apiFetch(`/api/v1/admin/targets?${qp.toString()}`),
        apiFetch('/api/v1/admin/jobs/stats'),
        apiFetch('/api/v1/admin/settings')
      ]);
      
      targets = tRes.items || [];
      stats = sRes;
      headedMode = !!setRes.headedMode;
      maxConcurrency = setRes.maxConcurrency || 5;
      workTimeStart = setRes.workTimeStart || '07:30';
      workTimeEnd = setRes.workTimeEnd || '16:00';
    } catch (err) { console.error('LoadData failed:', err); } finally { loading = false; }
  }

  async function updateSettings(newSettings) {
    try {
      const res = await apiFetch('/api/v1/admin/settings', { method: 'POST', body: JSON.stringify(newSettings) });
      headedMode = !!res.headedMode;
      maxConcurrency = res.maxConcurrency;
      workTimeStart = res.workTimeStart;
      workTimeEnd = res.workTimeEnd;
    } catch (err) { console.error('UpdateSettings failed:', err); }
  }

  // --- HELPERS ---
  function toggleSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
  }

  function sortIndicator(key) {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '▲' : '▼';
  }

  function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    return d.toDateString() === new Date().toDateString();
  }

  function formatWITA(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit', timeZone: 'Asia/Makassar', hour12: false });
  }

  function getStatusWaktu(jam, type) {
    if (!jam || ['','-','--:--'].includes(jam.trim())) return 'missing';
    const cleanJam = jam.replace(/[^0-9:]/g, "");
    if (type === 'in') return cleanJam > workTimeStart ? 'late' : 'ontime';
    return cleanJam < workTimeEnd ? 'early' : 'ontime';
  }

  // --- DERIVED ---
  const sortedTargets = $derived.by(() => {
    let list = [...targets];
    return list.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];

      // Special case for last_run date
      if (sortKey === 'last_run') {
        const at = av ? new Date(av.replace(' ', 'T') + 'Z').getTime() : -Infinity;
        const bt = bv ? new Date(bv.replace(' ', 'T') + 'Z').getTime() : -Infinity;
        return sortDir === 'asc' ? at - bt : bt - at;
      }

      // Handle nulls/undefined
      if (av === null || av === undefined) av = '';
      if (bv === null || bv === undefined) bv = '';

      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  });
  const attendanceStats = $derived.by(() => {
    let missIn = 0; let missOut = 0;
    targets.forEach(t => {
      if (t.status === 'success' && isToday(t.last_run)) {
        if (!t.jam_masuk || ['','-','--:--'].includes(t.jam_masuk.trim())) missIn++;
        if (!t.jam_pulang || ['','-','--:--'].includes(t.jam_pulang.trim())) missOut++;
      }
    });
    return { missIn, missOut };
  });

  // --- ACTIONS ---
  async function runTarget(id) {
    try {
      const t = targets.find(x => x.id === id);
      if (t && t.status !== 'idle' && t.status !== 'pending') {
        const jr = await apiFetch(`/api/v1/admin/jobs?limit=1000`);
        const job = jr.items.find(j => j.nip === t.nip);
        if (job) await apiFetch(`/api/v1/admin/jobs/${job.id}/retry`, { method: 'POST' });
        else await apiFetch(`/api/v1/admin/targets/${id}/enqueue`, { method: 'POST' });
      } else await apiFetch(`/api/v1/admin/targets/${id}/enqueue`, { method: 'POST' });
      await loadData();
    } catch (err) { alert(err.message); }
  }

  async function cancelJob(nip) {
    try {
      const jr = await apiFetch(`/api/v1/admin/jobs?limit=1000`);
      const job = jr.items.find(j => j.nip === nip && (j.status === 'running' || j.status === 'pending'));
      if (job) { await apiFetch(`/api/v1/admin/jobs/${job.id}/cancel`, { method: 'POST' }); await loadData(); }
    } catch (err) { alert(err.message); }
  }

  async function saveTarget() {
    try {
      const body = { nip: targetNip, nama: targetNama, password: targetPass };
      if (isEditing) await apiFetch(`/api/v1/admin/targets/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/api/v1/admin/targets', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); await loadData();
    } catch (err) { alert(err.message); }
  }

  async function deleteTarget(id) {
    if (confirm('Hapus target ini?')) {
      try { await apiFetch(`/api/v1/admin/targets/${id}`, { method: 'DELETE' }); await loadData(); } catch (err) { alert(err.message); }
    }
  }

  // --- MODALS ---
  function openAdd() { viewScreenshotUrl = ''; isEditing = false; editId = ''; targetNip = ''; targetNama = ''; targetPass = ''; isModalOpen = true; }
  function openEdit(t) { viewScreenshotUrl = ''; isEditing = true; editId = t.id; targetNip = t.nip; targetNama = t.nama; targetPass = ''; isModalOpen = true; }
  function openScreenshot(file) { if (!file) return; isEditing = false; viewScreenshotUrl = `/screenshots/${file}`; isModalOpen = true; }
  function closeModal() { isModalOpen = false; setTimeout(() => { viewScreenshotUrl = ''; isEditing = false; }, 200); }

  onMount(async () => {
    token = getTokens().accessToken || '';
    if (token) await loadData();
    let es = new EventSource(`/api/v1/admin/jobs/stream?token=${token}`);
    es.addEventListener('update', () => loadData());
    return () => es.close();
  });
</script>

{#if !token}
  <div class="login-wrapper">
    <div class="login-card card">
      <header class="login-header">
        <span class="login-logo">🛡️</span>
        <h1>Pusaka Scraper</h1>
        <p>Monitoring Presensi Otomatis</p>
      </header>
      <form class="login-form" onsubmit={e => { e.preventDefault(); login(); }}>
        <div class="field">
          <label for="user-login">Username</label>
          <input id="user-login" placeholder="admin" bind:value={username} />
        </div>
        <div class="field">
          <label for="pass-login">Password</label>
          <input id="pass-login" type="password" placeholder="••••" bind:value={password} />
        </div>
        {#if loginError}<div class="err-box">{loginError}</div>{/if}
        <button class="btn-primary login-btn" disabled={isLoggingIn}>
          {isLoggingIn ? 'Memverifikasi...' : 'Masuk'}
        </button>
      </form>
    </div>
  </div>
{:else}
  <div class="dashboard-container">
    <!-- TOP STATS -->
    <section class="stats-row">
      <div class="card stat"><span class="label">Total Akun</span><span class="value">{stats?.total ?? 0}</span></div>
      <div class="card stat blue"><span class="label">Running</span><span class="value">{stats?.running ?? 0}</span></div>
      <div class="card stat green"><span class="label">Success</span><span class="value">{stats?.success ?? 0}</span></div>
      <div class="card stat red"><span class="label">Failed</span><span class="value">{stats?.failed ?? 0}</span></div>
      <div class="card stat orange"><span class="label">Belum Masuk</span><span class="value">{attendanceStats.missIn}</span></div>
      <div class="card stat pink"><span class="label">Belum Pulang</span><span class="value">{attendanceStats.missOut}</span></div>
    </section>

    <!-- CONTENT TABLE -->
    <section class="card content-card">
      <header class="content-header">
        <div class="search-area">
          <input placeholder="Cari NIP atau Nama..." bind:value={searchQuery} oninput={loadData} class="search-input" />
        </div>
        <div class="actions-area">
          <div class="settings-bar">
            <div class="setting-item">In: <input type="text" value={workTimeStart} onchange={e => updateSettings({workTimeStart: e.target.value})} /></div>
            <div class="setting-item">Out: <input type="text" value={workTimeEnd} onchange={e => updateSettings({workTimeEnd: e.target.value})} /></div>
            <div class="setting-item">W: <input type="number" value={maxConcurrency} onchange={e => updateSettings({maxConcurrency: parseInt(e.target.value)})} /></div>
          </div>
          <div class="button-group">
            <button class="btn-secondary" onclick={() => updateSettings({headedMode: !headedMode})} title="Toggle Headed Mode">
              {headedMode ? '👀' : '🌑'}
            </button>
            <button class="btn-primary" onclick={openAdd}>➕ Akun</button>
            <button class="btn-primary" onclick={() => apiFetch('/api/v1/admin/targets/enqueue-all', {method:'POST'})}>🚀 Run All</button>
            <button class="btn-secondary danger" onclick={() => apiFetch('/api/v1/admin/jobs/cancel-all', {method:'POST'})}>🛑 Stop All</button>
          </div>
        </div>
      </header>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th width="45"><button class="sort-btn" onclick={()=>toggleSort('nip')}>No {sortIndicator('nip')}</button></th>
              <th><button class="sort-btn" onclick={()=>toggleSort('nama')}>Pegawai {sortIndicator('nama')}</button></th>
              <th><button class="sort-btn" onclick={()=>toggleSort('status')}>Status {sortIndicator('status')}</button></th>
              <th><button class="sort-btn" onclick={()=>toggleSort('jam_masuk')}>Masuk {sortIndicator('jam_masuk')}</button></th>
              <th><button class="sort-btn" onclick={()=>toggleSort('jam_pulang')}>Pulang {sortIndicator('jam_pulang')}</button></th>
              <th><button class="sort-btn" onclick={()=>toggleSort('last_run')}>Update {sortIndicator('last_run')}</button></th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedTargets as t, i (t.id)}
              <tr class:row-active={t.status === 'running'}>
                <td class="text-muted">{i+1}</td>
                <td>
                  <div class="pegawai-cell">
                    <span class="nip-text">{t.nip}</span>
                    <span class="nama-text">{t.nama}</span>
                  </div>
                </td>
                <td>
                  {#if t.status !== 'idle' && t.status !== 'pending' && t.status !== 'running' && !isToday(t.last_run)}
                    <span class="badge badge-expired">Expired</span>
                  {:else}
                    <span class="badge badge-{t.status}">
                      {t.status === 'idle' ? 'Idle' : t.status}
                      {#if t.status === 'running'}<span class="dot dot-run"></span>{/if}
                    </span>
                  {/if}
                </td>
                <td>
                  <span class="t-badge-{getStatusWaktu(t.jam_masuk, 'in')}">
                    {(t.jam_masuk || '--:--').replace(' WITA', '').replace(/[^0-9:]/g, "")}
                  </span>
                </td>
                <td>
                  <span class="t-badge-{getStatusWaktu(t.jam_pulang, 'out')}">
                    {(t.jam_pulang || '--:--').replace(' WITA', '').replace(/[^0-9:]/g, "")}
                  </span>
                </td>
                <td class="time-cell">{formatWITA(t.last_run)}</td>
                <td>
                  <div class="btn-group-row">
                    {#if t.screenshot}<button class="btn-icon view" onclick={() => openScreenshot(t.screenshot)} title="Screenshot">📸</button>{/if}
                    {#if t.status === 'running' || t.status === 'pending'}
                      <button class="btn-icon stop" onclick={() => cancelJob(t.nip)} title="Stop">⏹️</button>
                    {:else}
                      <button class="btn-icon run" onclick={() => runTarget(t.id)} title="Run">
                        {t.status === 'success' && !isToday(t.last_run) ? '🔄' : '▶️'}
                      </button>
                    {/if}
                    <button class="btn-icon" onclick={() => openEdit(t)} title="Edit">✏️</button>
                    <button class="btn-icon del" onclick={() => deleteTarget(t.id)} title="Hapus">🗑️</button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr><td colspan="6" class="empty-row">Belum ada data target. Klik "Tambah Akun" untuk memulai.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <!-- MODAL -->
  {#if isModalOpen}
    <div class="modal-overlay" onclick={closeModal} role="presentation">
      <div 
        class="modal-card" 
        class:wide-modal={!!viewScreenshotUrl} 
        onclick={e => e.stopPropagation()} 
        role="dialog" 
        aria-modal="true"
        tabindex="-1"
      >
        <header class="modal-header">
          <h3>{viewScreenshotUrl ? '🖼️ Bukti Screenshot' : (isEditing ? '✏️ Edit Akun' : '➕ Tambah Akun')}</h3>
          <button class="close-x" onclick={closeModal} aria-label="Tutup">&times;</button>
        </header>
        <div class="modal-body">
          {#if viewScreenshotUrl}
            <div class="sc-container">
              <img src={viewScreenshotUrl} alt="Screenshot" />
              <a href={viewScreenshotUrl} download class="btn-primary full-btn">💾 Simpan Gambar</a>
            </div>
          {:else}
            <div class="form-grid">
              <div class="field"><label for="nip-f">NIP</label><input id="nip-f" bind:value={targetNip} /></div>
              <div class="field"><label for="nama-f">Nama</label><input id="nama-f" bind:value={targetNama} /></div>
              <div class="field"><label for="pass-f">Password</label><input id="pass-f" type="password" bind:value={targetPass} /></div>
              <button class="btn-primary full-btn" onclick={saveTarget}>Konfirmasi</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* --- LAYOUT --- */
  .dashboard-container { display: flex; flex-direction: column; gap: 20px; }
  
  /* --- STATS --- */
  .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .stat { padding: 16px; border-radius: 16px; background: #18181b; border: 1px solid #27272a; border-left: 4px solid #3f3f46; transition: 0.2s; }
  .stat.blue { border-left-color: #38bdf8; } .stat.green { border-left-color: #10b981; } .stat.red { border-left-color: #f43f5e; }
  .stat.orange { border-left-color: #f59e0b; } .stat.pink { border-left-color: #ec4899; }
  .stat .label { font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; margin-bottom: 4px; display: block; }
  .stat .value { font-size: 24px; font-weight: 800; color: white; }

  /* --- TABLE AREA --- */
  .content-card { background: #18181b; border: 1px solid #27272a; border-radius: 20px; overflow: hidden; }
  .content-header { padding: 20px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  
  .search-input { background: #09090b; border: 1px solid #27272a; color: white; padding: 10px 16px; border-radius: 12px; font-size: 14px; width: 100%; max-width: 300px; outline: none; }
  .search-input:focus { border-color: #38bdf8; }

  .actions-area { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .settings-bar { display: flex; gap: 8px; }
  .setting-item { background: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 6px 12px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #71717a; }
  .setting-item input { background: transparent; border: none; color: #38bdf8; font-weight: 800; width: 45px; text-align: center; outline: none; }

  .button-group { display: flex; gap: 8px; }

  /* --- TABLE --- */
  .table-container { overflow-x: auto; width: 100%; }
  table { width: 100%; border-collapse: collapse; min-width: 850px; }
  th { background: #09090b; padding: 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #27272a; }
  td { padding: 8px 12px; border-bottom: 1px solid #27272a; vertical-align: middle; color: #e4e4e7; font-size: 13px; }
  tr:hover { background: #1c1c21; }
  .row-active { background: rgba(56, 189, 248, 0.05); }

  .pegawai-cell { line-height: 1.2; }
  .nip-text { font-weight: 800; color: white; display: block; font-size: 13px; }
  .nama-text { font-size: 10px; color: #71717a; }

  .status-cell { display: flex; align-items: center; }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-left: 8px; }
  .dot-run { background: #38bdf8; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); } 70% { transform: scale(1.3); box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); } 100% { transform: scale(1); } }

  .results-cell { display: flex; flex-direction: column; gap: 4px; }
  [class*="t-badge-"] { padding: 2px 8px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 11px; width: fit-content; }
  .t-badge-late { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.2); }
  .t-badge-early { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }
  .t-badge-ontime { background: rgba(16, 185, 129, 0.12); color: #10b981; }
  .t-badge-missing { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px dashed #ef4444; }

  .time-cell { font-size: 12px; color: #a1a1aa; }
  .btn-group-row { display: flex; gap: 6px; }
  .btn-icon { background: #27272a; border: 1px solid #3f3f46; color: white; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 14px; }
  .btn-icon:hover { background: #3f3f46; transform: translateY(-1px); }
  .btn-icon.view { color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
  .btn-icon.run { color: #38bdf8; border-color: rgba(56, 189, 248, 0.3); }
  .btn-icon.stop { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
  .btn-icon.del { color: #71717a; }
  
  .sort-btn { background: transparent; border: none; color: inherit; font: inherit; cursor: pointer; display: flex; align-items: center; gap: 6px; width: 100%; height: 100%; }
  .empty-row { padding: 60px !important; text-align: center; color: #71717a; font-style: italic; }

  /* --- MODAL --- */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
  .modal-card { background: #18181b; border: 1px solid #27272a; border-radius: 24px; width: 100%; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
  .wide-modal { max-width: 550px; }
  .modal-header { padding: 24px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
  .modal-header h3 { margin: 0; font-size: 18px; color: white; }
  .close-x { background: none; border: none; color: #71717a; font-size: 28px; cursor: pointer; padding: 0; }
  
  .modal-body { padding: 24px; overflow-y: auto; max-height: 80vh; }
  .sc-container { display: flex; flex-direction: column; gap: 16px; }
  .sc-container img { width: 100%; border-radius: 12px; border: 1px solid #27272a; }
  
  .form-grid { display: flex; flex-direction: column; gap: 20px; }
  .field label { font-size: 11px; font-weight: 700; color: #71717a; text-transform: uppercase; margin-bottom: 8px; display: block; }
  .field input { background: #09090b; border: 1px solid #27272a; color: white; padding: 12px 16px; border-radius: 12px; width: 100%; outline: none; transition: 0.2s; }
  .field input:focus { border-color: #38bdf8; }
  .full-btn { width: 100%; padding: 14px !important; font-size: 14px; }

  /* --- LOGIN --- */
  .login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at top right, #1e293b, #09090b); margin: -20px; }
  .login-card { width: 380px; padding: 48px; border-radius: 24px; text-align: center; }
  .login-logo { font-size: 56px; margin-bottom: 20px; display: block; }
  .login-header h1 { font-size: 24px; margin: 0; color: white; }
  .login-header p { color: #71717a; margin: 8px 0 32px; font-size: 14px; }
  .err-msg { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 12px; border-radius: 12px; font-size: 13px; margin-bottom: 20px; }
  .login-btn { margin-top: 12px; }

  /* --- MOBILE --- */
  @media (max-width: 1024px) {
    .content-header { padding: 16px; }
    .actions-area { width: 100%; flex-direction: column; align-items: stretch; }
    .settings-bar { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .button-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .btn-add { grid-column: span 2; }
    .search-input { max-width: none; }
  }
</style>
