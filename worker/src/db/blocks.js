// --- Blocks (Entries) -------------------------------------------------
// An entry is one piece of content inside a Space -- a paragraph, a
// list, a Work item, a Milestone. Every type shares this one table; what
// differs is the JSON in `content` and the markers in `properties`
// (which Categories it belongs to, which Workspaces it was assembled
// into, which Project it serves, its own theme override).
//
// Editing content and editing those markers are separate functions on
// purpose: they're independent edits, and a PATCH can carry any subset.

import { TEST_SPACE_ID } from './constants.js';
import { logActivity, logBlockEdit } from './activityLog.js';
import { normalizeTextContent, normalizeWorkContent } from './normalize.js';
import { WORK_TYPES } from './work.js';
import { recordTrash } from './trash.js';
import { describeBlockContentChange } from '../changeSummary.js';

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
async function hydrateReferenceBlocks(env, blocks) {
  const targetIds = [
    ...new Set(
      blocks
        .filter((block) => block.type === 'reference' && block.content.target_space_id)
        .map((block) => block.content.target_space_id)
    ),
  ];
  if (targetIds.length === 0) return blocks;

  const placeholders = targetIds.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(`SELECT id, title FROM spaces WHERE id IN (${placeholders})`)
    .bind(...targetIds)
    .all();
  const titleById = new Map(results.map((row) => [row.id, row.title]));

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

export async function listBlocksForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(
    `SELECT id, space_id, type, content, properties, position, created_at, updated_at
     FROM blocks
     WHERE space_id = ?
     ORDER BY position ASC, created_at ASC`
  )
    .bind(spaceId)
    .all();
  return hydrateReferenceBlocks(env, results.map(parseBlockRow));
}

// "What references this Space" -- the basic backlink lookup CLAUDE.md
// asks for. No graph structure is stored; this just queries Reference
// blocks by their target_space_id, using the index built for exactly
// this purpose.
export async function listBacklinksForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.content AS content,
            spaces.id AS source_space_id, spaces.title AS source_space_title
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'reference'
       AND json_extract(blocks.content, '$.target_space_id') = ?`
  )
    .bind(spaceId)
    .all();

  return results.map((row) => ({
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
export async function getGraphData(env) {
  const spacesResult = await env.DB.prepare(`SELECT id, title, status FROM spaces WHERE id != ? ORDER BY title ASC`)
    .bind(TEST_SPACE_ID)
    .all();

  const workspacesResult = await env.DB.prepare(
    `SELECT workspaces.id, workspaces.space_id, workspaces.name
     FROM workspaces
     JOIN spaces ON spaces.id = workspaces.space_id
     WHERE spaces.id != ?
     ORDER BY workspaces.name ASC`
  )
    .bind(TEST_SPACE_ID)
    .all();

  // A Project has no Space of its own anymore (see projects.js), so its
  // place on the map is derived from wherever its member entries live.
  const projectPairsResult = await env.DB.prepare(
    `SELECT DISTINCT projects.id AS project_id, projects.name AS name, blocks.space_id AS space_id
       FROM projects
       JOIN blocks ON json_extract(blocks.properties, '$.projectId') = projects.id
       JOIN spaces ON spaces.id = blocks.space_id
      WHERE spaces.id != ?
      ORDER BY projects.name ASC`
  )
    .bind(TEST_SPACE_ID)
    .all();

  // One node per Project, anchored at the first Space its work appears
  // in -- `primary_space_id` is a computed placement hint for the map,
  // not a stored column.
  const projects = [];
  const seenProject = new Set();
  projectPairsResult.results.forEach((row) => {
    if (seenProject.has(row.project_id)) return;
    seenProject.add(row.project_id);
    projects.push({ id: row.project_id, name: row.name, primary_space_id: row.space_id });
  });

  const referenceRows = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.space_id AS source_space_id, blocks.content AS content
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'reference' AND spaces.id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();

  const referenceEdges = referenceRows.results
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

  const containmentEdges = workspacesResult.results.map((workspace) => ({
    kind: 'contains',
    spaceId: workspace.space_id,
    workspaceId: workspace.id,
  }));

  const projectContainmentEdges = projectPairsResult.results.map((row) => ({
    kind: 'contains-project',
    spaceId: row.space_id,
    projectId: row.project_id,
  }));

  return {
    spaces: spacesResult.results,
    workspaces: workspacesResult.results,
    projects,
    edges: [...referenceEdges, ...containmentEdges, ...projectContainmentEdges],
  };
}

export async function getBlockById(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, space_id, type, content, properties, position, created_at, updated_at
     FROM blocks
     WHERE id = ?`
  )
    .bind(id)
    .first();
  return parseBlockRow(row);
}

// Same as getBlockById, plus the parent Space's own title -- backs the
// standalone GET /blocks/:id route specifically, so a cross-Space
// support-point pointer (see WorkBlock.jsx) can show which Space a
// linked claim actually lives in, not just its text. A separate,
// dedicated function rather than adding this to getBlockById itself,
// which is called everywhere else in this file and has no need for it.
export async function getBlockByIdWithSpaceTitle(env, id) {
  const block = await getBlockById(env, id);
  if (!block) return block;
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();
  return { ...block, spaceTitle: space?.title ?? null };
}

// type is optional: pass it to count only blocks of that type, which is
// what lets the Test Space seed each Block type independently as it's
// built, without re-seeding types that already have demo content.
export async function countBlocksForSpace(env, spaceId, type = null) {
  const row = type
    ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = ?`).bind(spaceId, type).first()
    : await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ?`).bind(spaceId).first();
  return row.count;
}

// Used by seedTestSpace.js so each seeded block can check "does the
// block I'm responsible for already exist" independently of every
// other seeded block, rather than one shared "has any list been seeded"
// flag blocking the rest.
export async function blockExistsAtPosition(env, spaceId, position) {
  const row = await env.DB.prepare(`SELECT id FROM blocks WHERE space_id = ? AND position = ?`)
    .bind(spaceId, position)
    .first();
  return !!row;
}

// The next free `position` for a new block in this Space -- used both
// by addBlockToSpace below and by skeleton.js's ensureSkeletonLanes
// (a Skeleton lane is just an ordinary List block, appended the same
// way). Lives here rather than in skeleton.js since "what position
// comes next" is a Blocks-table concern regardless of which Tool is
// being added.
export async function nextPosition(env, spaceId) {
  const row = await env.DB.prepare(`SELECT MAX(position) AS maxPosition FROM blocks WHERE space_id = ?`)
    .bind(spaceId)
    .first();
  return row.maxPosition === null ? 0 : row.maxPosition + 1;
}

export async function createBlock(env, { spaceId, type, content = {}, properties = {}, position = 0 }) {
  const id = crypto.randomUUID();
  const normalizedContent =
    type === 'text' ? normalizeTextContent(content) : WORK_TYPES.includes(type) ? normalizeWorkContent(content) : content;
  await env.DB.prepare(
    `INSERT INTO blocks (id, space_id, type, content, properties, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, spaceId, type, JSON.stringify(normalizedContent), JSON.stringify(properties), position)
    .run();
  return getBlockById(env, id);
}

// Adding a block to an already-live Space -- same createBlock as
// everything else uses, just appended at the end. Logged here
// specifically (not inside createBlock itself), since createBlock also
// fires once per starter block when a Template is applied -- that
// would bury "a Space was created" under a burst of near-duplicate
// block-added entries for the same moment.
export async function addBlockToSpace(env, spaceId, { type, content = {}, properties = {} }) {
  const position = await nextPosition(env, spaceId);
  const block = await createBlock(env, { spaceId, type, content, properties, position });
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(spaceId).first();
  const summary = `Added a ${type} entry to "${space?.title ?? spaceId}"`;
  await logActivity(env, {
    spaceId,
    spaceTitle: space?.title ?? null,
    blockId: block.id,
    kind: 'block_added',
    summary,
  });
  return { ...block, changeSummary: summary };
}

export async function deleteBlock(env, id) {
  const block = await getBlockById(env, id);
  // Snapshotted before removal so the delete is undoable. The raw row,
  // not the parsed one getBlockById returns.
  if (block) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();
    const rows = (await env.DB.prepare(`SELECT * FROM blocks WHERE id = ?`).bind(id).all()).results;
    await recordTrash(env, {
      kind: 'block',
      label: block.type,
      context: space?.title ?? null,
      payload: { blocks: rows },
    });
  }
  await env.DB.prepare(`DELETE FROM blocks WHERE id = ?`).bind(id).run();
  if (block) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();
    await logActivity(env, {
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
export async function moveBlockInSpace(env, spaceId, blockId, direction) {
  const blocks = await listBlocksForSpace(env, spaceId);
  const index = blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= blocks.length) return;

  const current = blocks[index];
  const target = blocks[targetIndex];
  await env.DB.prepare(`UPDATE blocks SET position = ? WHERE id = ?`).bind(target.position, current.id).run();
  await env.DB.prepare(`UPDATE blocks SET position = ? WHERE id = ?`).bind(current.position, target.id).run();
}

// Moving an entry to a different Space. Until this existed an entry was
// stuck wherever it was first written -- which made any "capture it now,
// file it later" surface a one-way trap, and quietly broke the standing
// rule that anything you can create you can also change.
//
// The careful part is which of `properties` survives the move, because
// some of it is scoped to the Space the entry is leaving:
//
//   categories  cleared. These are names of the *source* Space's own
//               Categories (see spaces.categories). The target Space has
//               its own, unrelated set; carrying names across would file
//               the entry under a Category that either doesn't exist
//               there or, worse, exists there meaning something else.
//   workspaces  cleared. These are ids of Workspaces that belong to the
//               source Space (workspaces.space_id), so in the target they
//               would resolve to nothing at all.
//   projectId   kept. A Project deliberately belongs to no Space (see
//               projects.js) -- its members live in whatever Spaces they
//               were created in -- so a Milestone that moves house is
//               still serving the same Project, and the Project's own
//               page just starts listing it under a different Space.
//   theme       kept. A per-entry look the person chose by hand; nothing
//               about it refers to the Space.
//
// A Skeleton lane block is refused rather than moved: the four lanes plus
// the articulation block *are* the source Space's Skeleton, identified by
// their properties.skeletonLane marker, so moving one out would silently
// leave that Space with a hole in a structure the promotion shorthand,
// Trail snapshots and Rewind all read. Move the lines, not the lane.
export async function moveBlockToSpace(env, id, targetSpaceId) {
  const block = await getBlockById(env, id);
  if (!block) return { error: 'not found' };
  if (block.space_id === targetSpaceId) return { error: 'already there' };

  const target = await env.DB.prepare(`SELECT id, title FROM spaces WHERE id = ?`).bind(targetSpaceId).first();
  if (!target) return { error: 'target space not found' };
  if (block.properties.skeletonLane) return { error: 'a Skeleton section cannot be moved out of its Space' };

  const source = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();
  // Named with a leading underscore purely to say "deliberately
  // dropped" -- the point of this destructure is what it leaves behind.
  const { categories: _categories, workspaces: _workspaces, ...kept } = block.properties;
  const position = await nextPosition(env, targetSpaceId);

  await env.DB.prepare(
    `UPDATE blocks SET space_id = ?, properties = ?, position = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(targetSpaceId, JSON.stringify(kept), position, id)
    .run();

  // Logged against both ends, since from either Space's own Trail this
  // is a real change to what that Space holds -- and the source row is
  // the only record left there that the entry was ever present.
  const summary = `Moved a ${block.type} entry to "${target.title}"`;
  await logActivity(env, {
    spaceId: block.space_id,
    spaceTitle: source?.title ?? null,
    kind: 'block_removed',
    summary: `Moved a ${block.type} entry out to "${target.title}"`,
  });
  await logActivity(env, {
    spaceId: targetSpaceId,
    spaceTitle: target.title,
    blockId: id,
    kind: 'block_added',
    summary: `Moved a ${block.type} entry in from "${source?.title ?? block.space_id}"`,
  });
  return { ...(await getBlockById(env, id)), changeSummary: summary };
}

// First editable block content: replaces a block's whole content blob.
// Whichever block-editing UI calls this is responsible for merging in
// unchanged fields (e.g. keeping an existing tag when only text changes).
//
// Every edit is recorded, in one of two shapes: a change
// describeBlockContentChange can actually name (a Milestone reached, a
// Session completed) gets its own row, since it happened once and is
// worth seeing on its own; anything else coalesces into a plain
// "edited" row (see logBlockEdit) so a writing session doesn't fill the
// history with twenty identical lines.
//
// `logEdit: false` is for callers that already write their own history
// entry for the same change -- skeleton.js's promotion/filing/Tension
// functions each log a Trail entry describing what they just did, and
// recording it a second time here would double-report one action.
export async function updateBlockContent(env, id, content, { logEdit = true } = {}) {
  const existing = await getBlockById(env, id);
  await env.DB.prepare(`UPDATE blocks SET content = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(content), id)
    .run();

  if (logEdit && existing) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(existing.space_id).first();
    const named = describeBlockContentChange(existing, content);
    if (named) {
      await logActivity(env, {
        spaceId: existing.space_id,
        spaceTitle: space?.title ?? null,
        blockId: id,
        kind: 'block_changed',
        summary: named,
      });
    } else {
      await logBlockEdit(env, {
        spaceId: existing.space_id,
        spaceTitle: space?.title ?? null,
        blockId: id,
        summary: `Edited a ${existing.type} entry in "${space?.title ?? existing.space_id}"`,
      });
    }
  }
  return getBlockById(env, id);
}

// Which of a Space's own Categories (freely-named facets specific to
// its topic, see spaces.js's updateSpace) this block belongs to -- a
// block can belong to more than one at once, or none. This lives in
// `properties` (it's an attribute of the block, not its content)
// alongside the existing skeletonLane/skeletonRole markers, which is
// why it's a dedicated function rather than going through
// updateBlockContent.
export async function updateBlockCategories(env, id, categories) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, categories };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

// Which Workspaces (see workspaces.js) this block has been deliberately
// assembled into -- a block can belong to several, or none, same
// many-to-many shape as Categories, stored the same way in `properties`
// for the same reason (it's an attribute of the block, not its
// content). Unlike Categories, a Workspace is a real row elsewhere (it
// has its own name, its own page, it can be renamed or deleted
// independently), so this array holds workspace ids, not names -- the
// frontend resolves id -> current name/existence itself.
export async function updateBlockWorkspaces(env, id, workspaceIds) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, workspaces: workspaceIds };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

// Which Project (see projects.js) this block belongs to -- a single
// nullable id, not an array, since a Milestone or Session most
// naturally serves one project at a time (unlike a Tool, which can
// usefully belong to several Workspaces). Pass null to clear it. Scoped
// in practice to Milestone and Session (the two Time Types a "goal/
// project" is really about), but nothing here enforces that -- same
// "properties are just properties" looseness
// updateBlockCategories/updateBlockWorkspaces already have.
export async function updateBlockProject(env, id, projectId) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, projectId: projectId || null };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

// The manual half of this Tool's own look -- any subset of
// {accent, shape, density, typeface} overriding the distinct default
// its own type already computes (see frontend/src/theme/itemTheme.js).
// Passing null clears the override entirely, putting the block back on
// its type's default. Stored in `properties` alongside categories/
// workspaces/projectId rather than as its own column, same reasoning
// every other per-block attribute already follows: it's a property of
// the block, not its content.
export async function updateBlockTheme(env, id, theme) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, theme: theme || null };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}
