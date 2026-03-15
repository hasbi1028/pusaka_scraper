<script>
  import { onMount } from 'svelte';
  import { apiFetch, getTokens, login as loginWithPassword } from '$lib/auth/client';

  let username = $state('');
  let password = $state('');
  let token = $state('');
  let loginError = $state('');
  let isLoggingIn = $state(false);

  let targets = $state([]);
  let stats = $state(null);
  let statusFilter = $state('');
  let loading = $state(false);
  let actionError = $state('');
  let searchQuery = $state('');

  // Form Edit/Add Target
  let isModalOpen = $state(false);
  let isEditing = $state(false);
  let editId = $state('');
  let targetNip = $state('');
  let targetNama = $state('');
  let targetPass = $state('');

  async function login() {
    if (!username || !password) {
      loginError = 'Username dan password wajib diisi';
      return;
    }
    loginError = '';
    isLoggingIn = true;
    try {
      await loginWithPassword(username, password);
      token = getTokens().accessToken || '';
      await loadAll();
    } catch (err) {
      loginError = err.message || 'Login gagal, periksa kembali kredensial Anda';
    } finally {
      isLoggingIn = false;
    }
  }

  let headedMode = $state(false);
  let maxConcurrency = $state(5);

  async function loadData() {
    loading = true;
    try {
      const qp = new URLSearchParams();
      if (statusFilter) qp.set('status', statusFilter);
      if (searchQuery) qp.set('q', searchQuery);
      qp.set('limit', '500');

      const [tRes, sRes, setRes] = await Promise.all([
        apiFetch(`/api/v1/admin/targets?${qp.toString()}`),
        apiFetch('/api/v1/admin/jobs/stats'),
        apiFetch('/api/v1/admin/settings')
      ]);
      
      targets = tRes.items || [];
      stats = sRes;
      headedMode = !!setRes.headedMode;
      maxConcurrency = setRes.maxConcurrency || 5;
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally { loading = false; }
  }

  async function updateSettings(newSettings) {
    try {
      const res = await apiFetch('/api/v1/admin/settings', {
        method: 'POST',
        body: JSON.stringify(newSettings)
      });
      headedMode = !!res.headedMode;
      maxConcurrency = res.maxConcurrency || 5;
    } catch (err) { 
      actionError = err.message; 
    }
  }

  async function toggleHeaded() {
    await updateSettings({ headedMode: !headedMode });
  }

  async function changeConcurrency(e) {
    const val = parseInt(e.target.value);
    if (val > 0) {
      await updateSettings({ maxConcurrency: val });
    }
  }

  async function loadAll() {
    try { await loadData(); } catch (err) {}
  }

  async function runTarget(id) {
    try {
      const target = targets.find(t => t.id === id);
      if (target && target.status !== 'idle' && target.status !== 'pending') {
        const jobsRes = await apiFetch(`/api/v1/admin/jobs?limit=1000`);
        const job = jobsRes.items.find(j => j.nip === target.nip);
        if (job) {
          await apiFetch(`/api/v1/admin/jobs/${job.id}/retry`, { method: 'POST' });
        } else {
          await apiFetch(`/api/v1/admin/targets/${id}/enqueue`, { method: 'POST' });
        }
      } else {
        await apiFetch(`/api/v1/admin/targets/${id}/enqueue`, { method: 'POST' });
      }
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  async function enqueueAll() {
    if (!confirm('Jalankan semua target ke antrean?')) return;
    try {
      await apiFetch('/api/v1/admin/targets/enqueue-all', { method: 'POST' });
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  async function retryAllFailed() {
    if (!confirm('Ulangi semua job yang gagal?')) return;
    try {
      await apiFetch('/api/v1/admin/jobs/retry-failed-all', { method: 'POST' });
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  async function cancelAll() {
    if (!confirm('Batalkan semua proses yang sedang berjalan dan di antrean?')) return;
    try {
      await apiFetch('/api/v1/admin/jobs/cancel-all', { method: 'POST' });
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  async function cancelJob(nip) {
    try {
      const jobsRes = await apiFetch(`/api/v1/admin/jobs?limit=1000`);
      const job = jobsRes.items.find(j => j.nip === nip && (j.status === 'running' || j.status === 'pending'));
      if (job) {
        await apiFetch(`/api/v1/admin/jobs/${job.id}/cancel`, { method: 'POST' });
        await loadData();
      }
    } catch (err) { actionError = err.message; }
  }

  async function deleteTarget(id) {
    if (!confirm('Hapus target ini?')) return;
    try {
      await apiFetch(`/api/v1/admin/targets/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  function openAdd() {
    isEditing = false; editId = ''; targetNip = ''; targetNama = ''; targetPass = '';
    isModalOpen = true;
  }

  function openEdit(t) {
    isEditing = true; editId = t.id; targetNip = t.nip; targetNama = t.nama; targetPass = '';
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
    actionError = '';
  }

  function isToday(dateStr) {
    if (!dateStr) return true; 
    try {
      const d = new Date(dateStr.includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
      const now = new Date();
      return d.toDateString() === now.toDateString();
    } catch { return true; }
  }

  function formatWITA(dateStr) {
    if (!dateStr) return '-';
    const cleanStr = dateStr.replace(' ', 'T').includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    return new Date(cleanStr).toLocaleTimeString('id-ID', {
      hour: '2-digit', 
      minute:'2-digit',
      timeZone: 'Asia/Makassar'
    });
  }

  function formatTanggalWITA(dateStr) {
    if (!dateStr) return '';
    const cleanStr = dateStr.replace(' ', 'T').includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    return new Date(cleanStr).toLocaleDateString('id-ID', {
      day: 'numeric', 
      month: 'short',
      timeZone: 'Asia/Makassar'
    });
  }

  async function saveTarget() {
    try {
      if (isEditing) {
        await apiFetch(`/api/v1/admin/targets/${editId}`, {
          method: 'PUT',
          body: JSON.stringify({ nip: targetNip, nama: targetNama, password: targetPass })
        });
      } else {
        await apiFetch('/api/v1/admin/targets', {
          method: 'POST',
          body: JSON.stringify({ nip: targetNip, nama: targetNama, password: targetPass })
        });
      }
      closeModal();
      await loadData();
    } catch (err) { actionError = err.message; }
  }

  onMount(async () => {
    token = getTokens().accessToken || '';
    if (!token) return;
    await loadAll();

    let es = new EventSource(`/api/v1/admin/jobs/stream?token=${token}`);
    es.addEventListener('update', () => loadData().catch(() => {}));
    return () => es.close();
  });
</script>

{#if !token}
  <div class="login-wrapper">
    <div class="login-card card">
      <div class="login-header">
        <div class="login-logo">🛡️</div>
        <h1>Pusaka Scraper</h1>
        <p>Sistem Pemantauan Presensi Otomatis</p>
      </div>
      
      <form class="login-form" onsubmit={e => { e.preventDefault(); login(); }}>
        <div class="field">
          <label for="u-login">Username</label>
          <input id="u-login" placeholder="admin" bind:value={username} autocomplete="username" disabled={isLoggingIn} />
        </div>
        <div class="field">
          <label for="p-login">Password</label>
          <input id="p-login" type="password" placeholder="••••••••" bind:value={password} autocomplete="current-password" disabled={isLoggingIn} />
        </div>
        {#if loginError}<div class="login-error-box"><span>⚠️</span> {loginError}</div>{/if}
        <button class="btn-primary login-btn" disabled={isLoggingIn}>
          {#if isLoggingIn}<span class="spinner"></span> Memverifikasi...{:else}Masuk ke Panel Admin{/if}
        </button>
      </form>
      <div class="login-footer">v2.5.0 &bull; Secure Access</div>
    </div>
  </div>
{:else}
  <div class="dashboard">
    <div class="stats-row">
      <div class="card stat">
        <span class="label">Total</span>
        <span class="value">{stats?.total ?? 0}</span>
      </div>
      <div class="card stat blue">
        <span class="label">Running</span>
        <span class="value">{stats?.running ?? 0}</span>
      </div>
      <div class="card stat green">
        <span class="label">Success</span>
        <span class="value">{stats?.success ?? 0}</span>
      </div>
      <div class="card stat red">
        <span class="label">Failed</span>
        <span class="value">{stats?.failed ?? 0}</span>
      </div>
      <div class="card stat orange">
        <span class="label">Pending</span>
        <span class="value">{stats?.not_success ?? 0}</span>
      </div>
      <div class="card stat pink">
        <span class="label">Belum Lengkap</span>
        <span class="value">{stats?.incomplete_presence ?? 0}</span>
      </div>
    </div>

    <div class="card table-area">
      <div class="header">
        <div class="left">
          <input placeholder="Cari NIP/Nama..." bind:value={searchQuery} oninput={loadData} class="search-input" />
        </div>
        <div class="actions">
          <div class="concurrency-control">
            <label for="max-concurrency">Workers:</label>
            <input id="max-concurrency" type="number" min="1" max="20" value={maxConcurrency} onchange={changeConcurrency} class="compact-input" />
          </div>
          <button class="btn-secondary" onclick={toggleHeaded} title="Toggle Browser">
            {headedMode ? '👀 Headed' : '🌑 Headless'}
          </button>
          <button class="btn-primary btn-add" onclick={openAdd}>➕ Akun</button>
          <button class="btn-primary" onclick={enqueueAll}>🚀 Run Semua</button>
          <button class="btn-secondary btn-danger-outline" onclick={cancelAll}>🛑 Stop</button>
          <button class="btn-secondary" onclick={retryAllFailed}>🔄 Retry</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Pegawai</th>
              <th>Status</th>
              <th>Hasil</th>
              <th>Update</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {#each targets as t (t.id)}
              <tr class:row-running={t.status === 'running'}>
                <td>
                  <div class="nip-box">
                    <span class="nip">{t.nip}</span>
                    <span class="nama">{t.nama || '-'}</span>
                  </div>
                </td>
                <td>
                  <div class="status-box">
                    {#if t.status !== 'idle' && t.status !== 'pending' && t.status !== 'running' && !isToday(t.last_run)}
                      <span class="badge badge-expired">Expired</span>
                    {:else}
                      <span class="badge badge-{t.status}">
                        {t.status === 'idle' ? 'Belum' : t.status}
                        {#if t.status === 'running'}<span class="dot-run"></span>{/if}
                        {#if t.status === 'pending'}<span class="dot-pending"></span>{/if}
                      </span>
                    {/if}
                    {#if t.error && t.status === 'failed'}<span class="error-tip" title={t.error}>⚠️</span>{/if}
                  </div>
                </td>
                <td>
                  <div class="res-box">
                    <span class="in">M: {(t.jam_masuk || '--:--').replace(' WITA', '')}</span>
                    <span class="out">P: {(t.jam_pulang || '--:--').replace(' WITA', '')}</span>
                  </div>
                </td>
                <td class="time-cell">
                  {#if t.last_run}
                    <div class="time-box">
                      <span class="t-time">{formatWITA(t.last_run)}</span>
                      {#if !isToday(t.last_run)}
                        <span class="t-date">{formatTanggalWITA(t.last_run)}</span>
                      {/if}
                    </div>
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  <div class="action-btns">
                    {#if t.status === 'running' || t.status === 'pending'}
                      <button class="btn-stop" onclick={() => cancelJob(t.nip)} title="Batalkan">⏹️</button>
                    {:else}
                      <button class="btn-run" onclick={() => runTarget(t.id)} title="Jalankan">
                        {t.status === 'failed' || (t.status === 'success' && !isToday(t.last_run)) ? '🔄' : '▶️'}
                      </button>
                    {/if}
                    <button class="btn-edit" onclick={() => openEdit(t)}>✏️</button>
                    <button class="btn-del" onclick={() => deleteTarget(t.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="5" class="empty-state">
                  <div class="empty-box">
                    <span class="empty-icon">📂</span>
                    <p>Belum ada data target.</p>
                    <button class="btn-primary" onclick={openAdd}>Tambah Akun</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  {#if isModalOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-overlay" onclick={closeModal} role="presentation">
      <div class="modal-card card" onclick={e => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <header class="modal-header">
          <h3>{isEditing ? '✏️ Edit Akun' : '➕ Tambah Akun'}</h3>
          <button class="close-btn" onclick={closeModal} aria-label="Tutup">&times;</button>
        </header>
        <div class="form">
          <div class="field">
            <label for="nip-input">NIP</label>
            <input id="nip-input" bind:value={targetNip} placeholder="199xxx..." />
          </div>
          <div class="field">
            <label for="nama-input">Nama</label>
            <input id="nama-input" bind:value={targetNama} placeholder="Nama Lengkap" />
          </div>
          <div class="field">
            <label for="pass-input">{isEditing ? 'Password Baru' : 'Password'}</label>
            <input id="pass-input" type="password" bind:value={targetPass} placeholder="••••••••" />
          </div>
          {#if actionError}<p class="err">{actionError}</p>{/if}
          <div class="form-actions">
            <button class="btn-primary full-btn" onclick={saveTarget}>{isEditing ? 'Update' : 'Simpan'}</button>
            <button class="btn-secondary full-btn" onclick={closeModal}>Batal</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .dashboard { display: flex; flex-direction: column; gap: 16px; }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }
  .stat { 
    padding: 16px; 
    background: #18181b; 
    border: 1px solid #27272a;
    border-left: 4px solid #3f3f46; 
  }
  .stat.blue { border-left-color: #38bdf8; }
  .stat.green { border-left-color: #10b981; }
  .stat.red { border-left-color: #f43f5e; }
  .stat.orange { border-left-color: #f59e0b; }
  .stat.pink { border-left-color: #ec4899; }
  .stat .label { font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; }
  .stat .value { font-size: 24px; font-weight: 800; color: white; }

  .table-area { min-height: 500px; display: flex; flex-direction: column; background: #18181b; border: 1px solid #27272a; }
  .header { padding: 20px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  
  .search-input { 
    background: #09090b;
    border: 1px solid #27272a;
    color: white;
    padding: 10px 16px; 
    border-radius: 10px; 
    font-size: 14px; 
    width: 100%;
    max-width: 300px;
  }

  .concurrency-control {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #09090b;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid #27272a;
    font-size: 12px;
    font-weight: 600;
    color: #a1a1aa;
  }

  .compact-input {
    background: #18181b;
    width: 45px;
    padding: 4px;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #38bdf8;
    text-align: center;
  }

  .table-container { flex: 1; overflow-x: auto; }
  table { min-width: 800px; }

  .nip-box { display: flex; flex-direction: column; line-height: 1; }
  .nip-box .nip { font-weight: 700; color: white; font-size: 12px; }
  .nip-box .nama { font-size: 9px; color: #71717a; }

  .status-box { display: flex; align-items: center; gap: 6px; }
  .dot-run { width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; animation: pulse 1.5s infinite; }
  .dot-pending { width: 8px; height: 8px; background: #71717a; border-radius: 50%; animation: blink 1.5s infinite; }

  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); }
    70% { transform: scale(1.3); opacity: 0.5; box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes blink { 50% { opacity: 0.2; } }

  .row-running { background: rgba(56, 189, 248, 0.05); }
  .row-running td { border-bottom-color: rgba(56, 189, 248, 0.2); }

  .res-box { display: flex; flex-direction: column; font-size: 10px; font-family: monospace; line-height: 1; }
  .res-box .in { color: #10b981; font-weight: bold; }
  .res-box .out { color: #f59e0b; font-weight: bold; }

  .action-btns { display: flex; gap: 6px; }
  .action-btns button { background: #27272a; border: 1px solid #3f3f46; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: white; }
  .btn-stop { color: #f87171 !important; border-color: rgba(248, 113, 113, 0.3) !important; }

  .time-box { display: flex; flex-direction: column; line-height: 1.2; }
  .t-time { font-weight: 600; color: #e4e4e7; }
  .t-date { font-size: 10px; color: #71717a; }

  /* LOGIN STYLES */
  .login-wrapper {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at top right, #1e293b, #09090b);
  }
  .login-card { width: 400px; padding: 40px; text-align: center; }
  .login-logo { font-size: 48px; margin-bottom: 16px; }
  .login-form { text-align: left; display: flex; flex-direction: column; gap: 20px; }
  .login-form input { background: #09090b; border: 1px solid #27272a; color: white; padding: 12px; border-radius: 10px; }
  .login-error-box { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 12px; border-radius: 8px; font-size: 13px; }
  .login-btn { padding: 14px !important; }

  .spinner { width: 18px; height: 18px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* MODAL DARK */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 2000; }
  .modal-card { background: #18181b; border: 1px solid #27272a; padding: 24px; border-radius: 20px; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding-bottom: 12px; margin-bottom: 20px; }
  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .field input { background: #09090b; border: 1px solid #27272a; color: white; padding: 12px; border-radius: 10px; }
  .form-actions { display: flex; flex-direction: column; gap: 10px; }
  .full-btn { width: 100%; }

  .btn-danger-outline { color: #f87171 !important; border-color: rgba(248, 113, 113, 0.2) !important; }

  @media (max-width: 1024px) {
    .header .actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 8px; }
    .btn-add, .concurrency-control { grid-column: span 2; }
    .search-input { max-width: none; }
  }
</style>
