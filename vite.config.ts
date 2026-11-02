import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
  test: {
    // Server tests run in node; component tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['./src/web/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
