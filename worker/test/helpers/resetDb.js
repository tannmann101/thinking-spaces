// Every test file's worker shares one D1 instance across all its it()
// blocks (confirmed live: state persists between tests in the same
// file), so calling this in a beforeEach is what keeps one test from
// seeing the last one's rows.
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
  'goals',
  'trash',
];

export async function resetDb(env) {
  await env.DB.exec(TABLES.map((table) => `DELETE FROM ${table}`).join('\n'));
}
