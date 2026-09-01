import { defineConfig } from 'vitest/config';

// Every test file gets its own fresh, isolated in-memory database --
// never the real personal data file. THINKING_SPACES_DB_PATH is read by
// db/index.js; setting it here (rather than in each test file) means it's
// in place before any test file's own imports run.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      THINKING_SPACES_DB_PATH: ':memory:',
    },
  },
});
