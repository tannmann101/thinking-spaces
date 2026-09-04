// Ported from backend/src/db/queries/exportData.js.

export const EXPORT_TABLES = [
  'templates',
  'resource_templates',
  'goals',
  'spaces',
  'blocks',
  'workspaces',
  'projects',
  'trail_entries',
  'activity_log',
];

export async function getFullExport(env) {
  const tables = {};
  for (const table of EXPORT_TABLES) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    tables[table] = results;
  }
  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    counts: Object.fromEntries(EXPORT_TABLES.map((table) => [table, tables[table].length])),
    tables,
  };
}
