// Ported from backend/src/db/queries/work.js. migrateWorkItemSupport is
// deliberately NOT ported: it exists on the Node side to upgrade rows
// written before the {support} shape existed, but a D1 database starts
// fresh on the current schema/content shapes, so there are never any
// old-shaped rows to migrate here.
//
// Every function in this Worker takes `env` explicitly (for env.DB, the
// D1 binding) rather than reading a module-level `db` singleton the way
// the Node backend does -- Workers have no safe place to stash a
// per-request value at module scope, so it's threaded as a plain
// parameter everywhere, same as gardners-hub's own Worker already does.

import { TEST_SPACE_ID } from './constants.js';

export const WORK_TYPES = [
  'assessment',
  'question',
  'analysis',
  'deduction',
  'definition',
  'demonstration',
  'insight',
  'implication',
  'hypothesis',
  'objection',
  'formulation',
];

// Synthesis's picker needs Work items across every Space -- same
// reasoning Resources are queried by tag membership rather than
// per-Space. The Test Space is excluded, same as every other
// cross-Space listing.
export async function listWorkItems(env) {
  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT blocks.id, blocks.type, blocks.content, blocks.space_id,
            spaces.title AS space_title
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type IN (${placeholders}) AND blocks.space_id != ?
     ORDER BY blocks.created_at DESC`
  )
    .bind(...WORK_TYPES, TEST_SPACE_ID)
    .all();
  return results.map((row) => ({ ...row, content: JSON.parse(row.content) }));
}
