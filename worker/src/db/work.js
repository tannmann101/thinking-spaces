// --- Work -----------------------------------------------------------
// "Work" is the umbrella for a new kind of Tool: not a generic Text/
// List block with a label, but a real, distinct Tool per kind of
// thinking-act (Assessment, Question, and whatever gets added later).
// Every kind shares one underlying shape ({statement, support,
// confidence} -- see WorkBlock.jsx on the frontend) so Synthesis (below)
// can treat them uniformly, but each is still its own registered Block
// type with its own component and catalog entry -- see
// frontend/src/registry/blocks.js. `support` is a list of discrete
// points (each free text, or a live pointer to another existing claim)
// -- see normalizeWorkContent (normalize.js) for how an older
// {rationale} blob upgrades into this shape.
//
// Adding a new kind of Work later means adding its block type here and
// registering it on the frontend; nothing else needs to change --
// listWorkItems and the Synthesis picker both pick it up automatically.
//
// There is no shape-upgrade migration in here. The Express backend had
// one (migrateWorkItemSupport) to upgrade rows written before the
// {support} shape existed; this database was created on the current
// shapes, so there has never been an old-shaped row to migrate.
//
// Every function in this Worker takes `env` explicitly (for env.DB, the
// D1 binding) rather than reading a module-level `db` singleton the way
// a Node server could -- Workers have no safe place to stash a
// per-request value at module scope, so it's threaded as a plain
// parameter everywhere, same as gardners-hub's own Worker already does.

import { TEST_SPACE_ID } from './constants.js';

// --- Work -----------------------------------------------------------
// "Work" is the umbrella for a new kind of Tool: not a generic Text/
// List block with a label, but a real, distinct Tool per kind of
// thinking-act (Assessment, Question, and whatever gets added later).
// Every kind shares one underlying shape ({statement, support,
// confidence} -- see WorkBlock.jsx on the frontend) so Synthesis (below)
// can treat them uniformly, but each is still its own registered Block
// type with its own component and catalog entry -- see
// frontend/src/registry/blocks.js. `support` is a list of discrete
// points (each free text, or a live pointer to another existing claim)
// -- see normalizeWorkContent (normalize.js) for how an older
// {rationale} blob upgrades into this shape.
//
// Adding a new kind of Work later means adding its block type here and
// registering it on the frontend; nothing else needs to change --
// listWorkItems and the Synthesis picker both pick it up automatically.
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
