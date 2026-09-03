import { randomUUID } from 'node:crypto';
import { db } from '../index.js';

// --- Trash ----------------------------------------------------------------
// A delete stops being permanent. Before any delete path removes rows, it
// snapshots them here; restoring puts them back exactly as they were.
//
// The alternative -- a `deleted_at` column on every table -- was
// deliberately not taken: it would mean every read query in the app
// filtering it forever, and one missed filter means deleted content
// quietly reappearing. Snapshotting touches only the six delete paths,
// and no existing read query changes at all.
//
// Nothing expires on its own. There is no background job in this app to
// run an expiry in, and silently destroying something a second time is
// exactly the behaviour this table exists to prevent -- so emptying the
// trash stays a deliberate act.

// rowid breaks the tie: deleted_at has only second granularity, so two
// deletes in the same second would otherwise come back in whatever order
// SQLite felt like, which is not an order at all.
export function listTrash() {
  return db
    .prepare(`SELECT id, kind, label, context, deleted_at FROM trash ORDER BY deleted_at DESC, rowid DESC`)
    .all();
}

export function getTrashEntry(id) {
  const row = db.prepare(`SELECT * FROM trash WHERE id = ?`).get(id);
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

// Called by a delete path *before* it deletes. `payload` maps a table
// name to the rows being removed from it, in the order they'd need to be
// put back (parents before children).
export function recordTrash({ kind, label, context = null, payload }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO trash (id, kind, label, context, payload) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    kind,
    label,
    context,
    JSON.stringify(payload)
  );
  return id;
}

// Puts every snapshotted row back, then drops the trash entry. Rows are
// re-inserted with their original ids, so anything that pointed at them
// (a Reference, a support-point pointer, a block's workspaces array)
// resolves again without any repair step.
//
// INSERT OR IGNORE rather than a plain INSERT: if some of the rows
// already exist -- restoring twice from two browser tabs, say -- the
// right outcome is "it's back", not a primary-key crash halfway through
// leaving a half-restored Space behind.
export function restoreFromTrash(id) {
  const entry = getTrashEntry(id);
  if (!entry) return null;

  const restore = db.transaction(() => {
    Object.entries(entry.payload).forEach(([table, rows]) => {
      rows.forEach((row) => {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        db.prepare(
          `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        ).run(...columns.map((column) => row[column]));
      });
    });
    db.prepare(`DELETE FROM trash WHERE id = ?`).run(id);
  });
  restore();

  return { kind: entry.kind, label: entry.label };
}

export function purgeTrashEntry(id) {
  const entry = db.prepare(`SELECT id FROM trash WHERE id = ?`).get(id);
  if (!entry) return false;
  db.prepare(`DELETE FROM trash WHERE id = ?`).run(id);
  return true;
}

export function emptyTrash() {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM trash`).get();
  db.prepare(`DELETE FROM trash`).run();
  return count;
}
