import { readFileSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Mirrors backend/vitest.config.js's own role: gives the test suite a
// real database to run against, rather than a mocked D1 client. Here
// that's an actual D1 instance inside the real Workers runtime (via
// Miniflare, through the cloudflareTest Vite plugin), reading its
// binding straight from wrangler.toml -- the same DB binding the real
// deployed Worker uses -- so these tests exercise the real
// env.DB.prepare()/.bind()/.all() calls worker/src/db/*.js actually
// makes, the same rigor backend/'s own better-sqlite3-backed tests give
// the Express version.
//
// schema.sql has to be read here, in this file, not inside test/setup.js
// -- this config file runs in plain Node (loaded by Vite), but a setup
// file runs bundled inside the sandboxed Workers runtime itself, which
// has no host filesystem access. So the file is read once here and
// handed in as a test-only binding, the same pattern the Workers team's
// own D1 example uses for passing migrations in (TEST_MIGRATIONS) --
// just carrying the raw schema text instead of a parsed migrations array,
// since this schema isn't split into a migrations/ directory.
//
// D1's own `.exec()` is far less forgiving than `wrangler d1 execute
// --file=` (which does its own preprocessing before sending statements
// to the API): it splits purely on newlines, doesn't understand `--`
// comments, and rejects a statement that spans more than one line. So
// schema.sql -- written as ordinary, commented, multi-line SQL for
// humans to read -- needs flattening into one statement per line here
// before it's usable. Safe to do with simple comment-stripping and a
// `;`-split rather than a real SQL parser, since this is our own
// hand-authored schema file, not untrusted input.
const rawSchema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8');
const schemaSql = rawSchema
  .split('\n')
  .map((line) => line.replace(/--.*$/, '').trim())
  .filter(Boolean)
  .join(' ')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)
  .join('\n');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_SCHEMA_SQL: schemaSql },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.js'],
  },
});
