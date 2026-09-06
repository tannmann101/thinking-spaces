// --- Export ---------------------------------------------------------------
// A complete, downloadable copy of everything this app holds. The point
// is durability: the real accumulated thinking lives in the deployed D1
// database, which no local script can reach. This runs inside the app,
// against whichever database the app is actually talking to, so the same
// button works locally and on the live site.
//
// Two shapes from one source, so they can't disagree -- the same split
// Reports already uses (structured data, then prose rendered from it):
//   JSON     the real backup. Every table, complete, nothing dropped.
//   Markdown the readable archive, for when this app isn't around.
//
// Deliberately export-only for now. A restore path is real work (id
// collisions, merge-versus-replace) and is only needed the day something
// breaks -- by which point the file is what matters.

// Ordered so a future restore could replay it top to bottom without
// tripping a foreign key: templates before spaces, spaces before
// everything that references one.
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
