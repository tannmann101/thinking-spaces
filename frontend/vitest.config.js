import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// A separate config from vite.config.js on purpose: the dev server's
// proxy/host settings there are meaningless for tests (there's no real
// backend running), and keeping them apart means neither config has to
// account for the other's concerns.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    globals: false,
  },
});
