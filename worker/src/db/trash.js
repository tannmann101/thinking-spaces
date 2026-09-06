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
export async function listTrash(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, label, context, deleted_at FROM trash ORDER BY deleted_at DESC, rowid DESC`
  ).all();
  return results;
}

export async function getTrashEntry(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM trash WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

// Called by a delete path *before* it deletes. `payload` maps a table
// name to the rows being removed from it, in the order they'd need to be
// put back (parents before children).
export async function recordTrash(env, { kind, label, context = null, payload }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO trash (id, kind, label, context, payload) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, kind, label, context, JSON.stringify(payload))
    .run();
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
export async function restoreFromTrash(env, id) {
  const entry = await getTrashEntry(env, id);
  if (!entry) return null;

  const statements = [];
  Object.entries(entry.payload).forEach(([table, rows]) => {
    rows.forEach((row) => {
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        ).bind(...columns.map((column) => row[column]))
      );
    });
  });
  statements.push(env.DB.prepare(`DELETE FROM trash WHERE id = ?`).bind(id));
  await env.DB.batch(statements);

  return { kind: entry.kind, label: entry.label };
}

export async function purgeTrashEntry(env, id) {
  const entry = await env.DB.prepare(`SELECT id FROM trash WHERE id = ?`).bind(id).first();
  if (!entry) return false;
  await env.DB.prepare(`DELETE FROM trash WHERE id = ?`).bind(id).run();
  return true;
}

export async function emptyTrash(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM trash`).first();
  await env.DB.prepare(`DELETE FROM trash`).run();
  return row.count;
}
