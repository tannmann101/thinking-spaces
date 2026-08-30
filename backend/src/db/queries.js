// The single set of query functions every route is expected to go
// through, per CLAUDE.md: "Keep all cross-Space queries ... going
// through a small, consistent set of query functions rather than ad hoc
// SQL sprinkled around." Route handlers should never write raw SQL --
// if a route needs a new query, it gets added here, not inline.

import { randomUUID } from 'node:crypto';
import { db } from './index.js';

// The one Space that always exists as Pass 2's scratch area. A fixed,
// well-known ID (rather than a new "is_test" column) keeps the schema
// exactly as CLAUDE.md specified it -- this is the one place that ID
// is defined, and everything else asks "does this id match?" through
// the isTestSpace flag added below, rather than hardcoding it elsewhere.
export const TEST_SPACE_ID = 'test-space';

// Visual Identity's two computed dimensions besides status (see the
// Tools & Resources doc). Both are plain per-space queries rather than
// a batched aggregate -- this app's tables are small enough (one
// person's Spaces) that an extra indexed query per Space in a list
// isn't worth the complexity of pre-aggregating.
function getRelationDensity(spaceId) {
  const outgoing = db
    .prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = 'reference'`)
    .get(spaceId).count;
  const incoming = db
    .prepare(
      `SELECT COUNT(*) AS count FROM blocks
       WHERE type = 'reference' AND json_extract(content, '$.target_space_id') = ?`
    )
    .get(spaceId).count;
  return outgoing + incoming;
}

// No "resolved" state exists yet for a Tension (that's Tension
// Resolver territory, not built) -- so every item in the Tensions lane
// currently counts as open.
function getOpenTensionCount(spaceId) {
  const row = db
    .prepare(
      `SELECT json_array_length(content, '$.items') AS count
       FROM blocks
       WHERE space_id = ? AND type = 'list' AND json_extract(properties, '$.skeletonLane') = 'tensions'`
    )
    .get(spaceId);
  return row ? row.count : 0;
}

function withComputedSpaceFields(space) {
  if (!space) return space;
  return {
    ...space,
    isTestSpace: space.id === TEST_SPACE_ID,
    relationDensity: getRelationDensity(space.id),
    openTensionCount: getOpenTensionCount(space.id),
  };
}

export function listSpaces() {
  const rows = db
    .prepare(
      `SELECT id, title, status, template_id, created_at, updated_at
       FROM spaces
       ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(withComputedSpaceFields);
}

export function getSpaceById(id) {
  const row = db
    .prepare(
      `SELECT id, title, status, template_id, created_at, updated_at
       FROM spaces
       WHERE id = ?`
    )
    .get(id);
  return withComputedSpaceFields(row);
}

// id is optional: pass one for a fixed, well-known Space (the Test
// Space, and the other seeded demo Spaces in seedTestSpace.js).
export function createSpace({ id = randomUUID(), title, templateId = null, status = 'nascent' }) {
  db.prepare(
    `INSERT INTO spaces (id, title, template_id, status)
     VALUES (?, ?, ?, ?)`
  ).run(id, title, templateId, status);
  return getSpaceById(id);
}

export function listTemplates() {
  return db
    .prepare(
      `SELECT id, name, block_arrangement, created_at, updated_at
       FROM templates
       ORDER BY name ASC`
    )
    .all();
}

// Idempotent: creates the Test Space the first time the app runs, does
// nothing on every run after that. Called once at startup.
export function ensureTestSpaceExists() {
  const existing = getSpaceById(TEST_SPACE_ID);
  if (existing) return existing;
  return createSpace({ id: TEST_SPACE_ID, title: 'Test Space', status: 'developing' });
}

function parseBlockRow(row) {
  if (!row) return row;
  return {
    ...row,
    content: JSON.parse(row.content),
    properties: JSON.parse(row.properties),
  };
}

// Reference blocks only store target_space_id in their content -- this
// looks up the target's current title in one batched query and attaches
// it as content.targetSpaceTitle, so the frontend never has to fetch
// each referenced Space separately just to show its name.
function hydrateReferenceBlocks(blocks) {
  const targetIds = [
    ...new Set(
      blocks
        .filter((block) => block.type === 'reference' && block.content.target_space_id)
        .map((block) => block.content.target_space_id)
    ),
  ];
  if (targetIds.length === 0) return blocks;

  const placeholders = targetIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, title FROM spaces WHERE id IN (${placeholders})`)
    .all(...targetIds);
  const titleById = new Map(rows.map((row) => [row.id, row.title]));

  return blocks.map((block) => {
    if (block.type !== 'reference') return block;
    return {
      ...block,
      content: {
        ...block.content,
        targetSpaceTitle: titleById.get(block.content.target_space_id) ?? null,
      },
    };
  });
}

export function listBlocksForSpace(spaceId) {
  const rows = db
    .prepare(
      `SELECT id, space_id, type, content, properties, position, created_at, updated_at
       FROM blocks
       WHERE space_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(spaceId);
  return hydrateReferenceBlocks(rows.map(parseBlockRow));
}

// "What references this Space" -- the basic backlink lookup CLAUDE.md
// asks for. No graph structure is stored; this just queries Reference
// blocks by their target_space_id, using the index built for exactly
// this purpose.
export function listBacklinksForSpace(spaceId) {
  const rows = db
    .prepare(
      `SELECT blocks.id AS block_id, blocks.content AS content,
              spaces.id AS source_space_id, spaces.title AS source_space_title
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type = 'reference'
         AND json_extract(blocks.content, '$.target_space_id') = ?`
    )
    .all(spaceId);

  return rows.map((row) => ({
    blockId: row.block_id,
    sourceSpaceId: row.source_space_id,
    sourceSpaceTitle: row.source_space_title,
    note: JSON.parse(row.content).note ?? null,
  }));
}

export function getBlockById(id) {
  const row = db
    .prepare(
      `SELECT id, space_id, type, content, properties, position, created_at, updated_at
       FROM blocks
       WHERE id = ?`
    )
    .get(id);
  return parseBlockRow(row);
}

// type is optional: pass it to count only blocks of that type, which is
// what lets the Test Space seed each Block type independently as it's
// built, without re-seeding types that already have demo content.
export function countBlocksForSpace(spaceId, type = null) {
  const row = type
    ? db.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = ?`).get(spaceId, type)
    : db.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ?`).get(spaceId);
  return row.count;
}

// Used by seedTestSpace.js so each seeded block can check "does the
// block I'm responsible for already exist" independently of every
// other seeded block, rather than one shared "has any list been seeded"
// flag blocking the rest.
export function blockExistsAtPosition(spaceId, position) {
  const row = db
    .prepare(`SELECT id FROM blocks WHERE space_id = ? AND position = ?`)
    .get(spaceId, position);
  return !!row;
}

export function createBlock({ spaceId, type, content = {}, properties = {}, position = 0 }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO blocks (id, space_id, type, content, properties, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, spaceId, type, JSON.stringify(content), JSON.stringify(properties), position);
  return getBlockById(id);
}

// First editable block content: replaces a block's whole content blob.
// Whichever block-editing UI calls this is responsible for merging in
// unchanged fields (e.g. keeping an existing tag when only text changes).
export function updateBlockContent(id, content) {
  db.prepare(
    `UPDATE blocks SET content = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(content), id);
  return getBlockById(id);
}

// --- Skeleton ---------------------------------------------------------
// "The Skeleton" isn't a new schema concept: it's four List blocks (the
// lanes) plus one Text block (Current Best Articulation), distinguished
// from any other block only by a marker in `properties`. This is the
// one place that marker convention is defined.
//
// Evidence has no shorthand trigger in the Tools & Resources doc (only
// Premises/Open Questions/Tensions do), and there's no "add an item"
// UI yet for List blocks -- so the Evidence lane exists but currently
// has no way to ever gain its first item. That's a known gap, not an
// oversight.
export const SKELETON_LANES = [
  { key: 'premises', label: 'Premises', trigger: '=' },
  { key: 'evidence', label: 'Evidence', trigger: null },
  { key: 'open-questions', label: 'Open Questions', trigger: '?' },
  { key: 'tensions', label: 'Tensions', trigger: '!' },
];

function nextPosition(spaceId) {
  const row = db.prepare(`SELECT MAX(position) AS maxPosition FROM blocks WHERE space_id = ?`).get(spaceId);
  return row.maxPosition === null ? 0 : row.maxPosition + 1;
}

function findSkeletonLaneBlock(spaceId, laneKey) {
  return listBlocksForSpace(spaceId).find(
    (block) => block.type === 'list' && block.properties.skeletonLane === laneKey
  );
}

// Idempotent per Space: creates whichever of the four lanes and the
// Current Best Articulation block don't already exist yet. Safe to
// call every time something is about to be promoted into a Skeleton.
export function ensureSkeletonLanes(spaceId) {
  SKELETON_LANES.forEach((lane) => {
    if (findSkeletonLaneBlock(spaceId, lane.key)) return;
    createBlock({
      spaceId,
      type: 'list',
      content: { items: [], laneLabel: lane.label },
      properties: { skeletonLane: lane.key },
      position: nextPosition(spaceId),
    });
  });

  const hasArticulation = listBlocksForSpace(spaceId).some(
    (block) => block.type === 'text' && block.properties.skeletonRole === 'current-best-articulation'
  );
  if (!hasArticulation) {
    createBlock({
      spaceId,
      type: 'text',
      content: { tag: null, text: '' },
      properties: { skeletonRole: 'current-best-articulation' },
      position: nextPosition(spaceId),
    });
  }
}

const PROMOTION_TRIGGERS = new Map(
  SKELETON_LANES.filter((lane) => lane.trigger).map((lane) => [lane.trigger, lane.key])
);

// Splits raw Text block content into (a) the lines that stay as prose
// and (b) any lines recognized as Skeleton shorthand, each tagged with
// which lane it promotes to.
function extractPromotions(text) {
  const keptLines = [];
  const promotions = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const trigger = trimmed.charAt(0);
    const laneKey = PROMOTION_TRIGGERS.get(trigger);
    if (laneKey && trimmed.slice(1).trim()) {
      promotions.push({ laneKey, text: trimmed.slice(1).trim() });
    } else {
      keptLines.push(line);
    }
  }
  return { keptText: keptLines.join('\n').trim(), promotions };
}

// Saves a Text block's new content, but first pulls out any
// `=`/`?`/`!` shorthand lines and appends them as new items (default
// confidence: tentative) in the matching Skeleton lane -- "parsed ...
// promoted into the Skeleton without leaving the surface." Promotion
// happens on save, not per keystroke; the end state is the same, this
// is just simpler and doesn't risk editing text out from under someone
// mid-keystroke.
export function saveTextBlockWithPromotion(blockId, newText) {
  const block = getBlockById(blockId);
  const { keptText, promotions } = extractPromotions(newText);

  if (promotions.length > 0) {
    ensureSkeletonLanes(block.space_id);
    promotions.forEach(({ laneKey, text }) => {
      const lane = findSkeletonLaneBlock(block.space_id, laneKey);
      const newItem = { id: randomUUID(), text, confidence: 'tentative' };
      updateBlockContent(lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
    });
  }

  return updateBlockContent(blockId, { ...block.content, text: keptText });
}
