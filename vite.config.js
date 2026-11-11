import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/Savage-Warrior-/' : '/',
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 2000 }
});
