import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';
import { normalizeWorkContent } from './normalize.js';

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

// One-time backfill mirroring migrateTextBlockLines() (skeleton.js):
// upgrades any pre-existing Work block still on the old {rationale}
// shape to the current {support} shape. New rows self-normalize via
// createBlock (blocks.js, via normalizeWorkContent); this only matters
// for a database that predates the support-point redesign.
export function migrateWorkItemSupport() {
  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT id, content FROM blocks WHERE type IN (${placeholders})`).all(...WORK_TYPES);
  rows.forEach((row) => {
    const content = JSON.parse(row.content);
    if (content.support) return;
    db.prepare(`UPDATE blocks SET content = ? WHERE id = ?`).run(JSON.stringify(normalizeWorkContent(content)), row.id);
  });
}

// Synthesis's picker needs to browse Work items across every Space,
// not just the one you're in -- the same reason Resources are queried
// by tag membership rather than per-Space. The Test Space is excluded,
// same reasoning as every other cross-Space listing.
export function listWorkItems() {
  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT blocks.id, blocks.type, blocks.content, blocks.space_id,
              spaces.title AS space_title
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type IN (${placeholders}) AND blocks.space_id != ?
       ORDER BY blocks.created_at DESC`
    )
    .all(...WORK_TYPES, TEST_SPACE_ID);
  return rows.map((row) => ({ ...row, content: JSON.parse(row.content) }));
}
