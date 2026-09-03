// Ported from backend/src/db/queries/blocks.js.

import { TEST_SPACE_ID } from './constants.js';
import { logActivity } from './activityLog.js';
import { normalizeTextContent, normalizeWorkContent } from './normalize.js';
import { WORK_TYPES } from './work.js';
import { recordTrash } from './trash.js';

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

// "What references this Space" -- the basic backlink lookup. No graph
// structure is stored; this just queries Reference blocks by their
// target_space_id, using the index built for exactly this purpose.
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

// The Graph view: every Reference block across every Space, as nodes
// (Spaces) and edges (References), plus every Workspace and every
// Project as their own nodes connected to their parent Space by a
// "contains" edge. Still a plain query over existing tables -- no
// separate graph structure is modeled or cached. The Test Space is
// left out, same as every other cross-Space view.
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

  const projectsResult = await env.DB.prepare(
    `SELECT projects.id, projects.space_id, projects.name
     FROM projects
     JOIN spaces ON spaces.id = projects.space_id
     WHERE spaces.id != ?
     ORDER BY projects.name ASC`
  )
    .bind(TEST_SPACE_ID)
    .all();

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

  const projectContainmentEdges = projectsResult.results.map((project) => ({
    kind: 'contains-project',
    spaceId: project.space_id,
    projectId: project.id,
  }));

  return {
    spaces: spacesResult.results,
    workspaces: workspacesResult.results,
    projects: projectsResult.results,
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
// linked claim actually lives in, not just its text.
export async function getBlockByIdWithSpaceTitle(env, id) {
  const block = await getBlockById(env, id);
  if (!block) return block;
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();
  return { ...block, spaceTitle: space?.title ?? null };
}

export async function countBlocksForSpace(env, spaceId, type = null) {
  const row = type
    ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = ?`).bind(spaceId, type).first()
    : await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ?`).bind(spaceId).first();
  return row.count;
}

export async function blockExistsAtPosition(env, spaceId, position) {
  const row = await env.DB.prepare(`SELECT id FROM blocks WHERE space_id = ? AND position = ?`)
    .bind(spaceId, position)
    .first();
  return !!row;
}

// The next free `position` for a new block in this Space -- used both
// by addBlockToSpace below and by skeleton.js's ensureSkeletonLanes.
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
// everything else uses, just appended at the end.
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

// Reordering blocks on a live Space: swaps two blocks' `position`
// values directly rather than renumbering the whole list.
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

export async function updateBlockContent(env, id, content) {
  await env.DB.prepare(`UPDATE blocks SET content = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(content), id)
    .run();
  return getBlockById(env, id);
}

export async function updateBlockCategories(env, id, categories) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, categories };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

export async function updateBlockWorkspaces(env, id, workspaceIds) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, workspaces: workspaceIds };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

export async function updateBlockProject(env, id, projectId) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, projectId: projectId || null };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}

// The manual half of this Tool's own look -- any subset of {accent,
// shape, density, typeface} overriding its type's distinct default, or
// null to clear back onto that default. See
// frontend/src/theme/itemTheme.js.
export async function updateBlockTheme(env, id, theme) {
  const block = await getBlockById(env, id);
  if (!block) return null;
  const properties = { ...block.properties, theme: theme || null };
  await env.DB.prepare(`UPDATE blocks SET properties = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(properties), id)
    .run();
  return getBlockById(env, id);
}
