import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';
import { logActivity } from './activityLog.js';
import { normalizeTextContent, normalizeWorkContent } from './normalize.js';
import { WORK_TYPES } from './work.js';

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
// Space, as nodes (Spaces) and edges (References), plus every Workspace
// and every Project as their own nodes connected to their parent Space
// by a "contains" edge -- the Relational Map integration Workspaces
// originally deferred, and Projects picked up in the same pass once an
// outside-review audit found Projects had been left out of the Graph
// entirely with no reason on record (unlike the Workspace precedent,
// this wasn't a deliberate deferral, just an unflagged gap). Still a
// plain query over existing tables -- CLAUDE.md is explicit that no
// separate graph structure gets modeled or cached, so this always
// reflects whatever the blocks/workspaces/projects tables currently
// hold. The Test Space (and anything inside it) is left out for the
// same reason it's left out of every other cross-Space view: it's
// scratch content, not part of the real Map.
export function getGraphData() {
  const spaces = db
    .prepare(`SELECT id, title, status FROM spaces WHERE id != ? ORDER BY title ASC`)
    .all(TEST_SPACE_ID);

  const workspaces = db
    .prepare(
      `SELECT workspaces.id, workspaces.space_id, workspaces.name
       FROM workspaces
       JOIN spaces ON spaces.id = workspaces.space_id
       WHERE spaces.id != ?
       ORDER BY workspaces.name ASC`
    )
    .all(TEST_SPACE_ID);

  const projects = db
    .prepare(
      `SELECT projects.id, projects.space_id, projects.name
       FROM projects
       JOIN spaces ON spaces.id = projects.space_id
       WHERE spaces.id != ?
       ORDER BY projects.name ASC`
    )
    .all(TEST_SPACE_ID);

  const referenceEdges = db
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
        kind: 'reference',
        blockId: row.block_id,
        sourceSpaceId: row.source_space_id,
        targetSpaceId: content.target_space_id,
        note: content.note ?? null,
      };
    })
    .filter((edge) => edge.targetSpaceId && edge.targetSpaceId !== TEST_SPACE_ID);

  const containmentEdges = workspaces.map((workspace) => ({
    kind: 'contains',
    spaceId: workspace.space_id,
    workspaceId: workspace.id,
  }));

  const projectContainmentEdges = projects.map((project) => ({
    kind: 'contains-project',
    spaceId: project.space_id,
    projectId: project.id,
  }));

  return {
    spaces,
    workspaces,
    projects,
    edges: [...referenceEdges, ...containmentEdges, ...projectContainmentEdges],
  };
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

// Same as getBlockById, plus the parent Space's own title -- backs the
// standalone GET /blocks/:id route specifically, so a cross-Space
// support-point pointer (see WorkBlock.jsx) can show which Space a
// linked claim actually lives in, not just its text. A separate,
// dedicated function rather than adding this to getBlockById itself,
// which is called everywhere else in this file and has no need for it.
export function getBlockByIdWithSpaceTitle(id) {
  const block = getBlockById(id);
  if (!block) return block;
  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(block.space_id);
  return { ...block, spaceTitle: space?.title ?? null };
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

// The next free `position` for a new block in this Space -- used both
// by addBlockToSpace below and by skeleton.js's ensureSkeletonLanes
// (a Skeleton lane is just an ordinary List block, appended the same
// way). Lives here rather than in skeleton.js since "what position
// comes next" is a Blocks-table concern regardless of which Tool is
// being added.
export function nextPosition(spaceId) {
  const row = db.prepare(`SELECT MAX(position) AS maxPosition FROM blocks WHERE space_id = ?`).get(spaceId);
  return row.maxPosition === null ? 0 : row.maxPosition + 1;
}

export function createBlock({ spaceId, type, content = {}, properties = {}, position = 0 }) {
  const id = randomUUID();
  const normalizedContent =
    type === 'text' ? normalizeTextContent(content) : WORK_TYPES.includes(type) ? normalizeWorkContent(content) : content;
  db.prepare(
    `INSERT INTO blocks (id, space_id, type, content, properties, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, spaceId, type, JSON.stringify(normalizedContent), JSON.stringify(properties), position);
  return getBlockById(id);
}

// Adding a block to an already-live Space -- same createBlock as
// everything else uses, just appended at the end. Logged here
// specifically (not inside createBlock itself), since createBlock also
// fires once per starter block when a Template is applied -- that
// would bury "a Space was created" under a burst of near-duplicate
// block-added entries for the same moment.
export function addBlockToSpace(spaceId, { type, content = {}, properties = {} }) {
  const block = createBlock({ spaceId, type, content, properties, position: nextPosition(spaceId) });
  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(spaceId);
  const summary = `Added a ${type} entry to "${space?.title ?? spaceId}"`;
  logActivity({
    spaceId,
    spaceTitle: space?.title ?? null,
    blockId: block.id,
    kind: 'block_added',
    summary,
  });
  return { ...block, changeSummary: summary };
}

export function deleteBlock(id) {
  const block = getBlockById(id);
  db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
  if (block) {
    const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(block.space_id);
    logActivity({
      spaceId: block.space_id,
      spaceTitle: space?.title ?? null,
      kind: 'block_removed',
      summary: `Removed a ${block.type} entry from "${space?.title ?? block.space_id}"`,
    });
  }
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

// Which of a Space's own Categories (freely-named facets specific to
// its topic, see spaces.js's updateSpace) this block belongs to -- a
// block can belong to more than one at once, or none. This lives in
// `properties` (it's an attribute of the block, not its content)
// alongside the existing skeletonLane/skeletonRole markers, which is
// why it's a dedicated function rather than going through
// updateBlockContent.
export function updateBlockCategories(id, categories) {
  const block = getBlockById(id);
  if (!block) return null;
  const properties = { ...block.properties, categories };
  db.prepare(
    `UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(properties), id);
  return getBlockById(id);
}

// Which Workspaces (see workspaces.js) this block has been deliberately
// assembled into -- a block can belong to several, or none, same
// many-to-many shape as Categories, stored the same way in `properties`
// for the same reason (it's an attribute of the block, not its
// content). Unlike Categories, a Workspace is a real row elsewhere (it
// has its own name, its own page, it can be renamed or deleted
// independently), so this array holds workspace ids, not names -- the
// frontend resolves id -> current name/existence itself.
export function updateBlockWorkspaces(id, workspaceIds) {
  const block = getBlockById(id);
  if (!block) return null;
  const properties = { ...block.properties, workspaces: workspaceIds };
  db.prepare(
    `UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(properties), id);
  return getBlockById(id);
}

// Which Project (see projects.js) this block belongs to -- a single
// nullable id, not an array, since a Milestone or Session most
// naturally serves one project at a time (unlike a Tool, which can
// usefully belong to several Workspaces). Pass null to clear it. Scoped
// in practice to Milestone and Session (the two Time Types a "goal/
// project" is really about), but nothing here enforces that -- same
// "properties are just properties" looseness
// updateBlockCategories/updateBlockWorkspaces already have.
export function updateBlockProject(id, projectId) {
  const block = getBlockById(id);
  if (!block) return null;
  const properties = { ...block.properties, projectId: projectId || null };
  db.prepare(
    `UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(properties), id);
  return getBlockById(id);
}
