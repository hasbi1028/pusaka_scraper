<script>
  import { onMount } from 'svelte';

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

  let username = $state('');
  let password = $state('');
  let token = $state('');
  let loginError = $state('');

  let jobs = $state([]);
  let stats = $state(null);
  let statusFilter = $state('');
  let jobsLoading = $state(false);

  let targets = $state([]);
  let targetsLoading = $state(false);

  let editingTargetId = $state('');
  let targetNip = $state('');
  let targetNama = $state('');
  let targetPassword = $state('');
  let targetError = $state('');
  let actionError = $state('');

  async function login() {
    loginError = '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        loginError = 'Login gagal';
        return;
      }
      const data = await res.json();
      token = data.access_token;
      localStorage.setItem('access_token', token);
      await loadAll();
    } catch {
      loginError = 'Tidak bisa terhubung ke backend';
    }
  }

  async function api(path, init = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {})
      }
    });

    if (!res.ok && res.status !== 204) {
      const raw = await res.text();
      try {
        const parsed = JSON.parse(raw);
        throw new Error(parsed?.error || raw);
      } catch {
        throw new Error(raw);
      }
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function loadJobs() {
    jobsLoading = true;
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const [j, s] = await Promise.all([
        api(`/api/v1/admin/jobs${query}`),
        api('/api/v1/admin/jobs/stats')
      ]);
      jobs = j.items || [];
      stats = s;
    } finally {
      jobsLoading = false;
    }
  }

  async function loadTargets() {
    targetsLoading = true;
    try {
      const data = await api('/api/v1/admin/targets');
      targets = data.items || [];
    } finally {
      targetsLoading = false;
    }
  }

  async function loadAll() {
    await Promise.all([loadJobs(), loadTargets()]);
  }

  async function retryJob(id) {
    actionError = '';
    try {
      await api(`/api/v1/admin/jobs/${id}/retry`, { method: 'POST' });
      await loadJobs();
    } catch (err) {
      actionError = String(err?.message || 'Retry gagal');
    }
  }

  function resetTargetForm() {
    editingTargetId = '';
    targetNip = '';
    targetNama = '';
    targetPassword = '';
    targetError = '';
  }

  function startEditTarget(target) {
    editingTargetId = target.id;
    targetNip = target.nip || '';
    targetNama = target.nama || '';
    targetPassword = '';
    targetError = '';
  }

  async function submitTarget() {
    targetError = '';

    if (!targetNip.trim()) {
      targetError = 'NIP wajib diisi';
      return;
    }

    if (!editingTargetId && !targetPassword.trim()) {
      targetError = 'Password wajib diisi saat tambah target';
      return;
    }

    try {
      if (editingTargetId) {
        await api(`/api/v1/admin/targets/${editingTargetId}`, {
          method: 'PUT',
          body: JSON.stringify({
            nip: targetNip.trim(),
            nama: targetNama.trim(),
            password: targetPassword
          })
        });
      } else {
        await api('/api/v1/admin/targets', {
          method: 'POST',
          body: JSON.stringify({
            nip: targetNip.trim(),
            nama: targetNama.trim(),
            password: targetPassword
          })
        });
      }

      resetTargetForm();
      await loadTargets();
    } catch (err) {
      targetError = String(err?.message || 'Gagal menyimpan target');
    }
  }

  async function deleteTarget(id) {
    actionError = '';
    if (!confirm('Hapus target ini?')) return;
    try {
      await api(`/api/v1/admin/targets/${id}`, { method: 'DELETE' });
      await loadTargets();
    } catch (err) {
      actionError = String(err?.message || 'Hapus target gagal');
    }
  }

  async function enqueueTarget(id) {
    actionError = '';
    try {
      await api(`/api/v1/admin/targets/${id}/enqueue`, { method: 'POST' });
      await loadJobs();
    } catch (err) {
      actionError = String(err?.message || 'Enqueue gagal');
    }
  }

  onMount(async () => {
    token = localStorage.getItem('access_token') || '';
    if (!token) return;
    await loadAll();

    const interval = setInterval(() => {
      loadJobs().catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  });
</script>

<section class="wrap">
  <h1>Pusaka Job Dashboard</h1>

  {#if !token}
    <div class="card auth">
      <h2>Login Admin</h2>
      <input placeholder="Username" bind:value={username} />
      <input placeholder="Password" bind:value={password} type="password" />
      <button onclick={login}>Login</button>
      {#if loginError}<p class="error">{loginError}</p>{/if}
    </div>
  {:else}
    <div class="toolbar card">
      <div class="stats">
        <span>Total: {stats?.total ?? 0}</span>
        <span>Pending: {stats?.pending ?? 0}</span>
        <span>Running: {stats?.running ?? 0}</span>
        <span>Success: {stats?.success ?? 0}</span>
        <span>Failed: {stats?.failed ?? 0}</span>
      </div>
      <div class="actions">
        <select bind:value={statusFilter} onchange={loadJobs}>
          <option value="">Semua status</option>
          <option value="pending">pending</option>
          <option value="running">running</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
        </select>
        <button onclick={loadAll} disabled={jobsLoading || targetsLoading}>
          {jobsLoading || targetsLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
    {#if actionError}
      <div class="card">
        <p class="error">{actionError}</p>
      </div>
    {/if}

    <div class="card">
      <h2>Data Target Scrape</h2>
      <div class="target-form">
        <input placeholder="NIP" bind:value={targetNip} />
        <input placeholder="Nama" bind:value={targetNama} />
        <input placeholder={editingTargetId ? 'Password baru (opsional)' : 'Password'} bind:value={targetPassword} type="password" />
        <div class="actions">
          <button onclick={submitTarget}>{editingTargetId ? 'Update Target' : 'Tambah Target'}</button>
          {#if editingTargetId}
            <button class="btn-secondary" onclick={resetTargetForm}>Batal</button>
          {/if}
        </div>
        {#if targetError}
          <p class="error">{targetError}</p>
        {/if}
      </div>

      <table>
        <thead>
          <tr>
            <th>NIP</th>
            <th>Nama</th>
            <th>Password</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if targets.length === 0}
            <tr><td colspan="4">Belum ada target</td></tr>
          {:else}
            {#each targets as target (target.id)}
              <tr>
                <td>{target.nip}</td>
                <td>{target.nama}</td>
                <td>********</td>
                <td class="actions">
                  <button onclick={() => enqueueTarget(target.id)}>Enqueue</button>
                  <button class="btn-secondary" onclick={() => startEditTarget(target)}>Edit</button>
                  <button class="btn-danger" onclick={() => deleteTarget(target.id)}>Hapus</button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Riwayat Jobs</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>NIP</th>
            <th>Nama</th>
            <th>Status</th>
            <th>Retry</th>
            <th>Error</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if jobs.length === 0}
            <tr><td colspan="7">Tidak ada job</td></tr>
          {:else}
            {#each jobs as job (job.id)}
              <tr>
                <td>{job.id}</td>
                <td>{job.nip}</td>
                <td>{job.nama}</td>
                <td>{job.status}</td>
                <td>{job.retry}</td>
                <td class="err">{job.error}</td>
                <td>
                  <button disabled={job.status !== 'failed'} onclick={() => retryJob(job.id)}>Retry</button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .wrap {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }

  h1,
  h2 {
    margin: 0;
    letter-spacing: 0.2px;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 18px;
  }

  .card {
    background: white;
    border: 1px solid #dbe3ee;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 8px 25px rgba(15, 23, 42, 0.05);
  }

  .auth {
    max-width: 420px;
    display: grid;
    gap: 10px;
  }

  .target-form {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  input,
  select,
  button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 12px;
    font: inherit;
  }

  button {
    background: #0f172a;
    color: white;
    cursor: pointer;
  }

  .btn-secondary {
    background: #475569;
  }

  .btn-danger {
    background: #b91c1c;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error,
  .err {
    color: #b91c1c;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    padding: 10px;
    vertical-align: top;
  }

  @media (max-width: 760px) {
    table,
    thead,
    tbody,
    tr,
    th,
    td {
      display: block;
      width: 100%;
    }

    thead {
      display: none;
    }

    tr {
      border-bottom: 1px solid #e2e8f0;
      padding: 8px 0;
    }

    td {
      border: none;
      padding: 4px 0;
    }
  }
</style>
