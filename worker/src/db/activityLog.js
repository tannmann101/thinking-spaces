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
