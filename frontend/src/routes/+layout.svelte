<script>
  import { page } from '$app/state';
  import { logout, getTokens } from '$lib/auth/client';
  import { onMount } from 'svelte';
  let { children } = $props();

  let isSidebarOpen = $state(false);
  let hasToken = $state(false);

  onMount(() => {
    const checkAuth = () => {
      hasToken = !!getTokens().accessToken;
    };
    checkAuth();
    const interval = setInterval(checkAuth, 1000);
    if (window.innerWidth > 1024) isSidebarOpen = true;
    return () => clearInterval(interval);
  });

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'Laporan', path: '/reports', icon: '📝' }
  ];

  function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }

  async function handleLogout() {
    if (confirm('Keluar dari sistem?')) {
      await logout();
      window.location.href = '/dashboard';
    }
  }
</script>

<svelte:head>
  <title>Pusaka Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"/>
</svelte:head>

<div class="admin-layout" class:sidebar-hidden={!isSidebarOpen || !hasToken}>
  {#if hasToken}
    {#if isSidebarOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sidebar-overlay" onclick={toggleSidebar}></div>
    {/if}

    <aside class="sidebar">
      <div class="sidebar-content">
        <div class="logo">
          <span class="icon">🛡️</span>
          <span class="text">Pusaka<strong>Admin</strong></span>
        </div>
        
        <nav class="nav">
          {#each navItems as item}
            <a href={item.path} class="nav-item" class:active={page.url.pathname === item.path} onclick={() => window.innerWidth < 1024 && (isSidebarOpen = false)}>
              <span class="nav-icon">{item.icon}</span>
              <span class="nav-text">{item.name}</span>
            </a>
          {/each}
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <div class="avatar">A</div>
            <div class="details">
              <span class="name">Administrator</span>
              <span class="role">Super Admin</span>
            </div>
          </div>
          <button class="logout-btn" onclick={handleLogout}>🚪 Logout</button>
        </div>
      </div>
    </aside>
  {/if}

  <main class="content-area">
    {#if hasToken}
      <header class="top-bar">
        <div class="top-left">
          <button class="toggle-btn" onclick={toggleSidebar} aria-label="Menu">
            {isSidebarOpen ? '✕' : '☰'}
          </button>
          <div class="breadcrumb">{navItems.find(n => n.path === page.url.pathname)?.name || 'Admin'}</div>
        </div>
        <div class="status-indicator"><span class="dot"></span> Online</div>
      </header>
    {/if}
    
    <div class="scroll-content" class:no-padding={!hasToken}>
      {@render children?.()}
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, sans-serif;
    background: #09090b;
    color: #f4f4f5;
    overflow: hidden;
  }

  :global(*) { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  .admin-layout { display: flex; height: 100vh; width: 100vw; background: #09090b; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 260px;
    background: #18181b;
    border-right: 1px solid #27272a;
    flex-shrink: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1000;
    overflow: hidden;
  }

  .sidebar-hidden .sidebar { width: 0; margin-left: -260px; border-right: none; }

  .sidebar-content { width: 260px; height: 100%; display: flex; flex-direction: column; }

  .logo { padding: 24px; display: flex; align-items: center; gap: 12px; font-size: 18px; border-bottom: 1px solid #27272a; }
  .logo strong { color: #38bdf8; }

  .nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px; text-decoration: none; color: #a1a1aa; border-radius: 8px; font-size: 14px; transition: 0.2s; }
  .nav-item:hover { background: #27272a; color: white; }
  .nav-item.active { background: #38bdf8; color: #09090b; font-weight: 700; }

  .sidebar-footer { padding: 16px; border-top: 1px solid #27272a; background: #0f0f12; display: flex; flex-direction: column; gap: 12px; }
  .user-info { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 36px; height: 36px; background: #38bdf8; color: #09090b; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
  .details .name { font-weight: 600; color: white; font-size: 13px; }
  .details .role { color: #71717a; font-size: 11px; }
  .logout-btn { background: #27272a; border: none; color: #f87171; padding: 10px; border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 600; }

  /* MAIN CONTENT */
  .content-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #09090b; position: relative; }
  .top-bar { height: 64px; background: #09090b; border-bottom: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
  .top-left { display: flex; align-items: center; gap: 12px; }
  .toggle-btn { background: #18181b; border: 1px solid #27272a; color: white; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 18px; border-radius: 10px; cursor: pointer; }
  .breadcrumb { font-size: 15px; font-weight: 700; color: white; }
  .status-indicator { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #10b981; font-weight: 600; }
  .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 10px #10b981; }

  .scroll-content { flex: 1; overflow-y: auto; padding: 20px; }
  .scroll-content.no-padding { padding: 0; }

  @media (max-width: 1024px) {
    .sidebar { position: fixed; left: 0; top: 0; height: 100vh; }
    .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 999; }
    .sidebar-hidden .sidebar { margin-left: -260px; }
    .scroll-content { padding: 16px; }
  }

  /* Global Classes */
  :global(.card) { background: #18181b; border: 1px solid #27272a; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
  :global(.badge) { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  :global(.badge-success) { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  :global(.badge-failed) { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  :global(.badge-running) { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
  :global(.badge-pending) { background: rgba(161, 161, 170, 0.1); color: #a1a1aa; }
  :global(.badge-expired) { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  :global(.btn-primary) { background: #38bdf8; color: #09090b; padding: 10px 16px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; }
  :global(.btn-secondary) { background: #27272a; color: white; padding: 10px 16px; border-radius: 10px; border: 1px solid #3f3f46; cursor: pointer; }
</style>
