// Single place the rest of the app gets its database connection from.
// Keeping this as the one file that opens the database and applies the
// schema means nobody else needs to know where the .sqlite file lives.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so the test suite can point this at an isolated ':memory:'
// database instead of the real personal data file -- set via
// THINKING_SPACES_DB_PATH in backend/vitest.config.js. Unset in normal
// (dev/production) use, so this still resolves to the one real file.
const DB_PATH = process.env.THINKING_SPACES_DB_PATH || path.join(__dirname, '..', '..', 'data', 'thinking-spaces.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// CREATE TABLE IF NOT EXISTS (above) only builds spaces as schema.sql
// describes it on a brand-new database -- it's a no-op against a
// spaces table that already exists, so columns added to schema.sql
// after Pass 1 (tags, goal) need this one-time, idempotent ALTER TABLE
// for any database file that predates them.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('spaces', 'tags', `TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('spaces', 'goal', 'TEXT');
ensureColumn('spaces', 'categories', `TEXT NOT NULL DEFAULT '[]'`);
// `accent` is superseded by `theme` and nothing reads it anymore -- kept
// here (and in schema.sql) purely so an existing database that already
// has the column keeps matching the declared schema. Dropping it would
// be a destructive migration on real personal data for no gain.
ensureColumn('spaces', 'accent', 'TEXT');
ensureColumn('spaces', 'theme', 'TEXT');
ensureColumn('spaces', 'origin', 'TEXT');
ensureColumn('spaces', 'due_date', 'TEXT');
ensureColumn('activity_log', 'block_id', 'TEXT');
ensureColumn('workspaces', 'kind', 'TEXT');
