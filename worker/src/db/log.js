// Ported from backend/src/db/queries/log.js.

import { TEST_SPACE_ID } from './constants.js';

export async function listGlobalActivity(env, limit = 300) {
  const { results } = await env.DB.prepare(
    `SELECT id, space_id, space_title, kind, summary, created_at
     FROM (
       SELECT id, space_id, space_title, kind, summary, created_at
       FROM activity_log
       UNION ALL
       SELECT trail_entries.id, trail_entries.space_id, spaces.title AS space_title,
              'trail_' || trail_entries.kind AS kind, trail_entries.summary, trail_entries.created_at
       FROM trail_entries
       JOIN spaces ON spaces.id = trail_entries.space_id
       WHERE spaces.id != ?
     )
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(TEST_SPACE_ID, limit)
    .all();
  return results;
}

export async function getActivityStats(env) {
  const activityTotal = await env.DB.prepare(`SELECT COUNT(*) AS count FROM activity_log`).first();
  const trailTotal = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM trail_entries
     JOIN spaces ON spaces.id = trail_entries.space_id
     WHERE spaces.id != ?`
  )
    .bind(TEST_SPACE_ID)
    .first();
  const totalCount = activityTotal.count + trailTotal.count;

  const last7Days = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM (
       SELECT created_at FROM activity_log WHERE created_at >= datetime('now', '-7 days')
       UNION ALL
       SELECT trail_entries.created_at FROM trail_entries
       JOIN spaces ON spaces.id = trail_entries.space_id
       WHERE spaces.id != ? AND trail_entries.created_at >= datetime('now', '-7 days')
     )`
  )
    .bind(TEST_SPACE_ID)
    .first();

  const mostActive = await env.DB.prepare(
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
    .bind(TEST_SPACE_ID)
    .first();

  return { totalCount, last7Days: last7Days.count, mostActive: mostActive || null };
}
