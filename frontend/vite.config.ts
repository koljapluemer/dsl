import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  // served from localhost only, size doesn't matter
  build: { chunkSizeWarningLimit: 1024 },
  server: { proxy: { '/api': 'http://127.0.0.1:8766' } },
  test: { globalSetup: './vitest.setup.ts' },
});
