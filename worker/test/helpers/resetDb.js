// Mirrors backend/test/helpers/resetDb.js exactly, adapted to D1's
// async API. Every test file's worker shares one D1 instance across
// all its it() blocks (confirmed live: state persists between tests in
// the same file, unlike backend's :memory: SQLite which gets a brand
// new file per test file but still needs this same per-test reset) --
// calling this in a beforeEach clears every table back to empty.
// Deletion order matters here (children before parents) since D1
// enforces foreign keys and has no per-connection PRAGMA toggle the
// way better-sqlite3 does.
const TABLES = [
  'trail_entries',
  'blocks',
  'workspaces',
  'projects',
  'activity_log',
  'spaces',
  'templates',
  'resource_templates',
];

export async function resetDb(env) {
  await env.DB.exec(TABLES.map((table) => `DELETE FROM ${table}`).join('\n'));
}
