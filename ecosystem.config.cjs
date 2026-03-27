module.exports = {
  apps: [
    {
      name: 'pusaka-frontend',
      script: 'frontend/build/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ORIGIN: 'http://localhost:3000',
        DB_PATH: './data/pusaka.db',
        JWT_SECRET: 'rahasia-anda-di-windows',
        WORKER_TOKEN: 'token-keamanan-worker'
      }
    },
    {
      name: 'pusaka-worker',
      script: 'src/index.ts',
      interpreter: 'bun', // Menggunakan runtime Bun
      env: {
        NODE_ENV: 'production',
        WORKER_TOKEN: 'token-keamanan-worker'
      }
    }
  ]
};
