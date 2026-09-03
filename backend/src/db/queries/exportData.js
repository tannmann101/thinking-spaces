import { db } from '../index.js';

// --- Export ---------------------------------------------------------------
// A complete, downloadable copy of everything this app holds. The point is
// durability: the real accumulated thinking now lives in the deployed D1
// database, so `export-to-d1.mjs` (a local CLI script reading the local
// SQLite file) can't back it up. This runs inside the app, against
// whichever database the app is actually using, and works identically in
// both backends.
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
  'spaces',
  'blocks',
  'workspaces',
  'projects',
  'trail_entries',
  'activity_log',
];

export function getFullExport() {
  const tables = {};
  EXPORT_TABLES.forEach((table) => {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  });
  return {
    exportedAt: new Date().toISOString(),
    // Bumped only if the shape below ever changes incompatibly, so an old
    // file can still be recognised for what it is.
    formatVersion: 1,
    counts: Object.fromEntries(EXPORT_TABLES.map((table) => [table, tables[table].length])),
    tables,
  };
}
