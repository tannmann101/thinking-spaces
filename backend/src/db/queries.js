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

const SPACE_COLUMNS = 'id, title, status, template_id, tags, goal, created_at, updated_at';

function withComputedSpaceFields(space) {
  if (!space) return space;
  return {
    ...space,
    tags: JSON.parse(space.tags ?? '[]'),
    isTestSpace: space.id === TEST_SPACE_ID,
    relationDensity: getRelationDensity(space.id),
    openTensionCount: getOpenTensionCount(space.id),
  };
}

export function listSpaces() {
  const rows = db
    .prepare(`SELECT ${SPACE_COLUMNS} FROM spaces ORDER BY updated_at DESC`)
    .all();
  return rows.map(withComputedSpaceFields);
}

// Reusable for "Resources" (tag: 'resource') and any future category --
// tags are a plain JSON array on the Space, queried by membership here
// rather than filtered ad hoc wherever a tag happens to be needed. The
// Test Space is excluded, same reasoning as every other cross-Space
// listing: it's scratch content, not a real Resource/category member.
export function listSpacesByTag(tag) {
  const rows = db
    .prepare(
      `SELECT ${SPACE_COLUMNS} FROM spaces
       WHERE id != ? AND EXISTS (
         SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = ?
       )
       ORDER BY updated_at DESC`
    )
    .all(TEST_SPACE_ID, tag);
  return rows.map(withComputedSpaceFields);
}

export function getSpaceById(id) {
  const row = db.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces WHERE id = ?`).get(id);
  return withComputedSpaceFields(row);
}

// id is optional: pass one for a fixed, well-known Space (the Test
// Space, and the other seeded demo Spaces in seedTestSpace.js). tags is
// only really used by seed data (e.g. tagging the Resource demo Space
// at creation) -- an ordinary new Space starts untagged and gets tagged
// later through the same PATCH /spaces/:id every other edit uses.
export function createSpace({ id = randomUUID(), title, templateId = null, status = 'nascent', tags = [] }) {
  db.prepare(
    `INSERT INTO spaces (id, title, template_id, status, tags)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, templateId, status, JSON.stringify(tags));
  return getSpaceById(id);
}

// A Space's title, status, tags, and goal ("what this Space is working
// towards" -- a property of the Space itself, separate from any block
// it contains) are all edited through this one function. Any subset of
// fields can be given; the rest keep their current value, same pattern
// as updateTemplate.
export function updateSpace(id, { title, status, tags, goal } = {}) {
  const existing = db.prepare(`SELECT * FROM spaces WHERE id = ?`).get(id);
  if (!existing) return null;

  const next = {
    title: title !== undefined ? title : existing.title,
    status: status !== undefined ? status : existing.status,
    tags: tags !== undefined ? JSON.stringify(tags) : existing.tags,
    goal: goal !== undefined ? goal : existing.goal,
  };
  db.prepare(
    `UPDATE spaces SET title = ?, status = ?, tags = ?, goal = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(next.title, next.status, next.tags, next.goal, id);
  return getSpaceById(id);
}

// You could create a Space but never get rid of one -- the last "add
// with no remove" gap. Blocks and Trail entries are deleted first
// since both carry a foreign key to spaces(id) with foreign_keys = ON
// (see db/index.js); there's no ON DELETE CASCADE on the schema, so
// this does it explicitly, in the same spirit as everything else in
// this file being plain and visible rather than relying on database
// magic. The Test Space is protected -- it's a fixed scratch area
// other code assumes exists (ensureTestSpaceExists recreates it if
// missing, but there's no reason to make that path fire by accident).
// A Reference block elsewhere that pointed at the deleted Space is left
// as-is; it just renders its raw target id once the title lookup can
// no longer resolve, the same graceful fallback a bad id already gets.
export function deleteSpace(id) {
  if (id === TEST_SPACE_ID) {
    throw new Error('The Test Space cannot be deleted');
  }
  db.prepare(`DELETE FROM blocks WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM trail_entries WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM spaces WHERE id = ?`).run(id);
}

function parseTemplateRow(row) {
  if (!row) return row;
  return { ...row, block_arrangement: JSON.parse(row.block_arrangement) };
}

export function listTemplates() {
  const rows = db
    .prepare(
      `SELECT id, name, block_arrangement, created_at, updated_at
       FROM templates
       ORDER BY name ASC`
    )
    .all();
  return rows.map(parseTemplateRow);
}

export function getTemplateById(id) {
  const row = db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id);
  return parseTemplateRow(row);
}

// id is optional, same reasoning as createSpace: a fixed id for the
// built-in templates seeded at startup (see seedTemplates.js).
export function createTemplate({ id = randomUUID(), name, blockArrangement }) {
  db.prepare(
    `INSERT INTO templates (id, name, block_arrangement) VALUES (?, ?, ?)`
  ).run(id, name, JSON.stringify(blockArrangement));
  return getTemplateById(id);
}

// Editing a Template only ever touches the templates table -- it never
// reaches into any Space, because applyTemplate (below) only ever runs
// once, at Space-creation time. There's no ongoing link for an edit to
// travel through.
export function updateTemplate(id, { name, blockArrangement }) {
  db.prepare(
    `UPDATE templates SET name = ?, block_arrangement = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, JSON.stringify(blockArrangement), id);
  return getTemplateById(id);
}

export function deleteTemplate(id) {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
}

// Applying a Template is a one-time copy, per CLAUDE.md -- not a live
// link back to the template. Each block spec in block_arrangement is
// just the same shape createBlock already takes.
export function applyTemplate(spaceId, templateId) {
  const template = getTemplateById(templateId);
  if (!template) return;
  template.block_arrangement.forEach((blockSpec) => {
    createBlock({ spaceId, ...blockSpec });
  });
}

// Creation Mode's whole job is composing a Space from the same pieces
// every other path already uses -- a Template's starting blocks
// (applyTemplate), any extra Tools chosen on top of it
// (addBlockToSpace), a Reference block per Resource pulled in
// (addBlockToSpace again, same as createRelationalSpace does for its
// selections), and the Space's own tags/goal (createSpace/updateSpace).
// Nothing here is new machinery -- this just does all of it in one
// request instead of asking the frontend to sequence several.
export function createSpaceWithSetup({
  title,
  templateId = null,
  extraBlocks = [],
  resourceSpaceIds = [],
  tags = [],
  goal = null,
}) {
  const space = createSpace({ title, templateId, tags });
  if (templateId) {
    applyTemplate(space.id, templateId);
  }
  extraBlocks.forEach((blockSpec) => {
    addBlockToSpace(space.id, blockSpec);
  });
  resourceSpaceIds.forEach((targetSpaceId) => {
    addBlockToSpace(space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  });
  if (goal) {
    updateSpace(space.id, { goal });
  }
  return getSpaceById(space.id);
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

// The Graph view (Pass 5's "Map"): every Reference block across every
// Space, as nodes (Spaces) and edges (References). This is a plain
// query over the blocks table -- CLAUDE.md is explicit that no separate
// graph structure gets modeled or cached, so this always reflects
// whatever the blocks table currently holds. The Test Space is left out
// for the same reason it's left out of every other cross-Space view:
// it's scratch content, not part of the real Map.
export function getGraphData() {
  const spaces = db
    .prepare(`SELECT id, title, status FROM spaces WHERE id != ? ORDER BY title ASC`)
    .all(TEST_SPACE_ID);

  const edges = db
    .prepare(
      `SELECT blocks.id AS block_id, blocks.space_id AS source_space_id, blocks.content AS content
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type = 'reference' AND spaces.id != ?`
    )
    .all(TEST_SPACE_ID)
    .map((row) => {
      const content = JSON.parse(row.content);
      return {
        blockId: row.block_id,
        sourceSpaceId: row.source_space_id,
        targetSpaceId: content.target_space_id,
        note: content.note ?? null,
      };
    })
    .filter((edge) => edge.targetSpaceId && edge.targetSpaceId !== TEST_SPACE_ID);

  return { spaces, edges };
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

// Adding a block to an already-live Space -- same createBlock as
// everything else uses, just appended at the end (nextPosition is
// defined further down, used the same way Skeleton lanes get appended).
export function addBlockToSpace(spaceId, { type, content = {}, properties = {} }) {
  return createBlock({ spaceId, type, content, properties, position: nextPosition(spaceId) });
}

export function deleteBlock(id) {
  db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
}

// A "Relational Space" isn't a distinct schema -- CLAUDE.md is explicit
// that it's just an ordinary Space whose content happens to reference
// two or more other Spaces. This composes the same createSpace/
// addBlockToSpace every other Space creation path uses: one Reference
// block per selected Space, plus one blank Text block for the
// synthesis, seeded once at creation like any Template would be.
export function createRelationalSpace({ title, spaceIds }) {
  const space = createSpace({ title });
  addBlockToSpace(space.id, { type: 'text', content: { tag: null, text: '' } });
  spaceIds.forEach((targetSpaceId) => {
    addBlockToSpace(space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  });
  return getSpaceById(space.id);
}

// Reordering blocks on a live Space (distinct from ListBlock's own
// item reordering, which stays inside one block's content): swaps two
// blocks' `position` values directly rather than renumbering the
// whole list, so it works regardless of what positions currently are.
export function moveBlockInSpace(spaceId, blockId, direction) {
  const blocks = listBlocksForSpace(spaceId);
  const index = blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= blocks.length) return;

  const current = blocks[index];
  const target = blocks[targetIndex];
  db.prepare(`UPDATE blocks SET position = ? WHERE id = ?`).run(target.position, current.id);
  db.prepare(`UPDATE blocks SET position = ? WHERE id = ?`).run(current.position, target.id);
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

  const updated = updateBlockContent(blockId, { ...block.content, text: keptText });

  // Log a Trail entry for whichever structural change just happened --
  // items promoted into lanes, or (if this was the articulation block
  // itself) its text changing. Both count as "a Skeleton structural
  // change" per the doc; an edit that's neither doesn't get logged.
  if (promotions.length > 0) {
    const laneLabelByKey = new Map(SKELETON_LANES.map((lane) => [lane.key, lane.label]));
    const counts = new Map();
    promotions.forEach(({ laneKey }) => counts.set(laneKey, (counts.get(laneKey) || 0) + 1));
    const summary = [...counts.entries()]
      .map(([laneKey, count]) => `${count} ${laneLabelByKey.get(laneKey)}`)
      .join(', ');
    logTrailEntry({ spaceId: block.space_id, kind: 'auto', summary: `Promoted: ${summary}` });
  } else if (block.properties.skeletonRole === 'current-best-articulation' && keptText !== block.content.text) {
    logTrailEntry({ spaceId: block.space_id, kind: 'auto', summary: 'Updated Current Best Articulation' });
  }

  return updated;
}

// --- Trail --------------------------------------------------------
// The history layer. Every entry snapshots the Skeleton's full state
// at that moment (all four lanes' items + the articulation text)
// rather than a diff -- simpler, and this app's data volumes make the
// extra storage a non-issue. "auto" entries log themselves (see
// saveTextBlockWithPromotion above); "manual" ones are the person
// adding a narrative "why" directly.
// Includes each lane's actual laneLabel (not just its items), since a
// Space Type can relabel lanes (e.g. Person-Reflection's "What I
// Understand" instead of "Premises") -- Rewind should show the label
// that was actually in use, not the generic default.
function getSkeletonSnapshot(spaceId) {
  const blocks = listBlocksForSpace(spaceId);
  const lanes = {};
  SKELETON_LANES.forEach((lane) => {
    const block = blocks.find((b) => b.type === 'list' && b.properties.skeletonLane === lane.key);
    lanes[lane.key] = {
      label: block ? block.content.laneLabel : lane.label,
      items: block ? block.content.items : [],
    };
  });
  const articulationBlock = blocks.find(
    (b) => b.type === 'text' && b.properties.skeletonRole === 'current-best-articulation'
  );
  return { lanes, articulation: articulationBlock ? articulationBlock.content.text : '' };
}

function parseTrailRow(row) {
  return { ...row, skeleton_snapshot: JSON.parse(row.skeleton_snapshot) };
}

export function logTrailEntry({ spaceId, kind, summary, note = null }) {
  const id = randomUUID();
  const snapshot = getSkeletonSnapshot(spaceId);
  db.prepare(
    `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, spaceId, kind, summary, note, JSON.stringify(snapshot));
  return parseTrailRow(db.prepare(`SELECT * FROM trail_entries WHERE id = ?`).get(id));
}

export function addManualTrailEntry(spaceId, note) {
  const summary = note.length > 60 ? `${note.slice(0, 57)}...` : note;
  return logTrailEntry({ spaceId, kind: 'manual', summary, note });
}

export function listTrailEntries(spaceId) {
  const rows = db
    .prepare(`SELECT * FROM trail_entries WHERE space_id = ? ORDER BY created_at ASC`)
    .all(spaceId);
  return rows.map(parseTrailRow);
}

// --- Dashboard aggregations -------------------------------------------
// Cross-Space surfacing features. The Test Space is excluded from all
// three -- it's scratch content, not something worth being reminded to
// review, reading about in a digest, or resurfaced as "maybe revisit
// this."

// Any List item anywhere with a reviewBy date in the past. Uses
// SQLite's json_each to look inside every List block's items array
// without pulling all of them into JS first.
export function listOverdueReviews() {
  const rows = db
    .prepare(
      `SELECT spaces.id AS space_id, spaces.title AS space_title, item.value AS item_json
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       JOIN json_each(blocks.content, '$.items') AS item
       WHERE blocks.type = 'list'
         AND spaces.id != ?
         AND json_extract(item.value, '$.reviewBy') IS NOT NULL
         AND json_extract(item.value, '$.reviewBy') < date('now')
       ORDER BY json_extract(item.value, '$.reviewBy') ASC`
    )
    .all(TEST_SPACE_ID);
  return rows.map((row) => ({
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    item: JSON.parse(row.item_json),
  }));
}

// Every Trail entry (auto or manual) from the last N days, across
// every Space -- a "what changed this week" digest for the Dashboard.
export function listRecentTrailEntries(days = 7) {
  const rows = db
    .prepare(
      `SELECT trail_entries.*, spaces.title AS space_title
       FROM trail_entries
       JOIN spaces ON spaces.id = trail_entries.space_id
       WHERE trail_entries.created_at >= datetime('now', ?)
         AND spaces.id != ?
       ORDER BY trail_entries.created_at DESC`
    )
    .all(`-${days} days`, TEST_SPACE_ID);
  return rows.map((row) => ({ ...parseTrailRow(row), spaceTitle: row.space_title }));
}

// One suggestion for "maybe revisit this": the nascent/dormant Space
// that's gone the longest without an update. Not random -- the most
// neglected one is the one most likely to actually be forgotten.
export function suggestSpaceToResurface() {
  const row = db
    .prepare(
      `SELECT id, title, status, updated_at
       FROM spaces
       WHERE status IN ('nascent', 'dormant') AND id != ?
       ORDER BY updated_at ASC
       LIMIT 1`
    )
    .get(TEST_SPACE_ID);
  return row || null;
}
