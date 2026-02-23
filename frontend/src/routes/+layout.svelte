<svelte:head>
  <title>Pusaka Dashboard</title>
</svelte:head>

<main>
  <slot />
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial;
    background: radial-gradient(circle at top right, #e7f5ff 0%, #f8fafc 45%, #f1f5f9 100%);
    color: #0f172a;
  }

  main {
    min-height: 100vh;
    padding: 24px;
  }
</style>
