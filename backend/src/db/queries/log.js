import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';

// --- The Log (global activity) -------------------------------------
// A cross-Space feed combining every structural lifecycle event
// (activity_log) with the finer-grained Skeleton history (trail_entries)
// into one chronological list -- "everything", without maintaining two
// separate places to look for it. Test Space activity never appears:
// logActivity (activityLog.js) already refuses to log it, and the
// trail_entries half of the union filters it out directly (trail_entries
// has no such guard at write time, since Trail is scoped to whatever
// Space it's viewed from and the Test Space legitimately uses it while
// demoing Skeleton promotion).
// block_id rides along so the Log can link a 'block_added' entry
// straight to that block (see SpacePage's ?highlight= deep-linking) --
// null for every other kind, including the whole trail_entries half of
// the union, since a Trail entry is about the Skeleton as a whole, not
// one block.
export function listGlobalActivity(limit = 300) {
  return db
    .prepare(
      `SELECT id, space_id, space_title, block_id, kind, summary, created_at
       FROM (
         SELECT id, space_id, space_title, block_id, kind, summary, created_at
         FROM activity_log
         UNION ALL
         SELECT trail_entries.id, trail_entries.space_id, spaces.title AS space_title,
                NULL AS block_id, 'trail_' || trail_entries.kind AS kind, trail_entries.summary, trail_entries.created_at
         FROM trail_entries
         JOIN spaces ON spaces.id = trail_entries.space_id
         WHERE spaces.id != ?
       )
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(TEST_SPACE_ID, limit);
}

// A first taste of "trends" over the Log: how much has happened, how
// much lately, and where. Deliberately simple -- a fuller trends view
// can grow from here once there's more data to see real patterns in.
export function getActivityStats() {
  const totalCount =
    db.prepare(`SELECT COUNT(*) AS count FROM activity_log`).get().count +
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM trail_entries
         JOIN spaces ON spaces.id = trail_entries.space_id
         WHERE spaces.id != ?`
      )
      .get(TEST_SPACE_ID).count;

  const last7Days = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (
         SELECT created_at FROM activity_log WHERE created_at >= datetime('now', '-7 days')
         UNION ALL
         SELECT trail_entries.created_at FROM trail_entries
         JOIN spaces ON spaces.id = trail_entries.space_id
         WHERE spaces.id != ? AND trail_entries.created_at >= datetime('now', '-7 days')
       )`
    )
    .get(TEST_SPACE_ID).count;

  const mostActive = db
    .prepare(
      `SELECT space_title, COUNT(*) AS count FROM (
         SELECT space_title FROM activity_log WHERE space_title IS NOT NULL
         UNION ALL
         SELECT spaces.title AS space_title FROM trail_entries
         JOIN spaces ON spaces.id = trail_entries.space_id
         WHERE spaces.id != ?
       )
       GROUP BY space_title
       ORDER BY count DESC
       LIMIT 1`
    )
    .get(TEST_SPACE_ID);

  return { totalCount, last7Days, mostActive: mostActive || null };
}
