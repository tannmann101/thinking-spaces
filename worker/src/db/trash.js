// Ported from backend/src/db/queries/trash.js -- see that file for why
// this is a snapshot table rather than a deleted_at column everywhere.

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

export async function recordTrash(env, { kind, label, context = null, payload }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO trash (id, kind, label, context, payload) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, kind, label, context, JSON.stringify(payload))
    .run();
  return id;
}

// D1 has no synchronous transaction the way better-sqlite3 does, so the
// re-inserts go through a batch -- which D1 applies atomically, giving
// the same all-or-nothing guarantee the Node side gets from its
// transaction wrapper.
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
