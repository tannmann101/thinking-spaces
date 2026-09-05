// Ported from backend/src/db/queries/activityLog.js.

import { TEST_SPACE_ID } from './constants.js';

export async function logActivity(env, { spaceId = null, spaceTitle = null, blockId = null, kind, summary }) {
  if (spaceId === TEST_SPACE_ID) return;
  await env.DB.prepare(
    `INSERT INTO activity_log (id, space_id, space_title, block_id, kind, summary) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), spaceId, spaceTitle, blockId, kind, summary)
    .run();
}

// How long repeated edits to the same entry keep folding into one row.
// See backend/src/db/queries/activityLog.js for the full reasoning.
const EDIT_COALESCE_MINUTES = 10;

export async function logBlockEdit(env, { spaceId, spaceTitle, blockId, summary }) {
  if (spaceId === TEST_SPACE_ID) return;
  const recent = await env.DB.prepare(
    `SELECT id, event_count FROM activity_log
      WHERE block_id = ? AND kind = 'block_edited'
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT 1`
  )
    .bind(blockId, `-${EDIT_COALESCE_MINUTES} minutes`)
    .first();

  if (recent) {
    await env.DB.prepare(
      `UPDATE activity_log SET event_count = ?, created_at = datetime('now') WHERE id = ?`
    )
      .bind(recent.event_count + 1, recent.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO activity_log (id, space_id, space_title, block_id, kind, summary) VALUES (?, ?, ?, ?, 'block_edited', ?)`
  )
    .bind(crypto.randomUUID(), spaceId, spaceTitle, blockId, summary)
    .run();
}
