// Ported from backend/src/db/queries/spaces.js.

import { TEST_SPACE_ID, todayString } from './constants.js';
import { logActivity } from './activityLog.js';
import { applyTemplate } from './templates.js';
import { createWorkspace } from './workspaces.js';
import { addBlockToSpace } from './blocks.js';

async function getRelationDensity(env, spaceId) {
  const outgoing = await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = 'reference'`)
    .bind(spaceId)
    .first();
  const incoming = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM blocks
     WHERE type = 'reference' AND json_extract(content, '$.target_space_id') = ?`
  )
    .bind(spaceId)
    .first();
  return outgoing.count + incoming.count;
}

async function getOpenTensionCount(env, spaceId) {
  const row = await env.DB.prepare(
    `SELECT json_array_length(content, '$.items') AS count
     FROM blocks
     WHERE space_id = ? AND type = 'list' AND json_extract(properties, '$.skeletonLane') = 'tensions'`
  )
    .bind(spaceId)
    .first();
  return row ? row.count : 0;
}

async function getMilestoneStats(env, spaceId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(json_extract(content, '$.reached')), 0) AS reached
     FROM blocks WHERE space_id = ? AND type = 'milestone'`
  )
    .bind(spaceId)
    .first();
  return { reached: row.reached, total: row.total };
}

const SPACE_COLUMNS =
  'id, title, status, template_id, tags, goal, categories, accent, origin, due_date, created_at, updated_at';

async function withComputedSpaceFields(env, space) {
  if (!space) return space;
  return {
    ...space,
    tags: JSON.parse(space.tags ?? '[]'),
    categories: JSON.parse(space.categories ?? '[]'),
    isTestSpace: space.id === TEST_SPACE_ID,
    relationDensity: await getRelationDensity(env, space.id),
    openTensionCount: await getOpenTensionCount(env, space.id),
    isOverdue: Boolean(space.due_date && space.due_date < todayString()),
    milestoneStats: await getMilestoneStats(env, space.id),
  };
}

export async function listSpaces(env) {
  const { results } = await env.DB.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces ORDER BY updated_at DESC`).all();
  return Promise.all(results.map((row) => withComputedSpaceFields(env, row)));
}

export async function listSpacesByTag(env, tag) {
  const { results } = await env.DB.prepare(
    `SELECT ${SPACE_COLUMNS} FROM spaces
     WHERE id != ? AND EXISTS (
       SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = ?
     )
     ORDER BY updated_at DESC`
  )
    .bind(TEST_SPACE_ID, tag)
    .all();
  return Promise.all(results.map((row) => withComputedSpaceFields(env, row)));
}

export async function getSpaceById(env, id) {
  const row = await env.DB.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces WHERE id = ?`).bind(id).first();
  return withComputedSpaceFields(env, row);
}

export async function createSpace(
  env,
  { id = crypto.randomUUID(), title, templateId = null, status = 'nascent', tags = [], categories = [], origin = null, dueDate = null }
) {
  await env.DB.prepare(
    `INSERT INTO spaces (id, title, template_id, status, tags, categories, origin, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, title, templateId, status, JSON.stringify(tags), JSON.stringify(categories), origin, dueDate)
    .run();
  const summary = `Created "${title}"`;
  await logActivity(env, { spaceId: id, spaceTitle: title, kind: 'space_created', summary });
  return { ...(await getSpaceById(env, id)), changeSummary: summary };
}

export async function updateSpace(env, id, { title, status, tags, goal, categories, accent, dueDate } = {}) {
  const existing = await env.DB.prepare(`SELECT * FROM spaces WHERE id = ?`).bind(id).first();
  if (!existing) return null;

  const next = {
    title: title !== undefined ? title : existing.title,
    status: status !== undefined ? status : existing.status,
    tags: tags !== undefined ? JSON.stringify(tags) : existing.tags,
    goal: goal !== undefined ? goal : existing.goal,
    categories: categories !== undefined ? JSON.stringify(categories) : existing.categories,
    accent: accent !== undefined ? accent : existing.accent,
    due_date: dueDate !== undefined ? dueDate : existing.due_date,
  };
  await env.DB.prepare(
    `UPDATE spaces SET title = ?, status = ?, tags = ?, goal = ?, categories = ?, accent = ?, due_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(next.title, next.status, next.tags, next.goal, next.categories, next.accent, next.due_date, id)
    .run();
  // changeSummary (see changeSummary.js) is a lighter-weight cousin of
  // the logActivity entry below -- a short sentence attached to the
  // response so the toast (see frontend's Toast.jsx) can say what
  // actually happened, not just "Saved". Mirrors backend/src/db/queries/
  // spaces.js's updateSpace exactly.
  let changeSummary = null;
  if (status !== undefined && status !== existing.status) {
    changeSummary = `Status changed to ${next.status}`;
    await logActivity(env, {
      spaceId: id,
      spaceTitle: next.title,
      kind: 'space_status_changed',
      summary: `"${next.title}" status changed to ${next.status}`,
    });
  }
  if (dueDate !== undefined && dueDate !== existing.due_date) {
    if (!next.due_date) {
      changeSummary = 'Due date cleared';
    } else {
      const overdue = next.due_date < todayString();
      changeSummary = overdue
        ? `Due ${next.due_date} -- already overdue`
        : `Due ${next.due_date} -- now shows on your Week digest`;
    }
  }
  const result = await getSpaceById(env, id);
  return changeSummary ? { ...result, changeSummary } : result;
}

// Blocks, Workspaces, and Trail entries are all deleted first since
// each carries a foreign key to spaces(id) -- D1 (like the Node
// backend) has no ON DELETE CASCADE on this schema, so this does it
// explicitly. The Test Space is protected.
export async function deleteSpace(env, id) {
  if (id === TEST_SPACE_ID) {
    throw new Error('The Test Space cannot be deleted');
  }
  const existing = await getSpaceById(env, id);
  await env.DB.prepare(`DELETE FROM blocks WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM workspaces WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM projects WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM trail_entries WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM spaces WHERE id = ?`).bind(id).run();
  if (existing) {
    await logActivity(env, {
      spaceId: null,
      spaceTitle: existing.title,
      kind: 'space_deleted',
      summary: `Deleted "${existing.title}"`,
    });
  }
}

export async function createSpaceWithSetup(
  env,
  { title, templateId = null, extraBlocks = [], resourceSpaceIds = [], tags = [], categories = [], workspaces = [], goal = null, origin = null }
) {
  const space = await createSpace(env, { title, templateId, tags, categories, origin });
  if (templateId) {
    await applyTemplate(env, space.id, templateId);
  }
  const workspaceIdByName = new Map();
  for (const name of workspaces) {
    const workspace = await createWorkspace(env, { spaceId: space.id, name });
    workspaceIdByName.set(name, workspace.id);
  }
  for (const { properties = {}, ...blockSpec } of extraBlocks) {
    const { workspaceNames, ...restProperties } = properties;
    const resolvedWorkspaceIds = (workspaceNames || []).map((name) => workspaceIdByName.get(name)).filter(Boolean);
    await addBlockToSpace(env, space.id, {
      ...blockSpec,
      properties: resolvedWorkspaceIds.length > 0 ? { ...restProperties, workspaces: resolvedWorkspaceIds } : restProperties,
    });
  }
  for (const targetSpaceId of resourceSpaceIds) {
    await addBlockToSpace(env, space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  }
  if (goal) {
    await updateSpace(env, space.id, { goal });
  }
  return { ...(await getSpaceById(env, space.id)), changeSummary: space.changeSummary };
}

// Idempotent: creates the Test Space the first time this runs, does
// nothing after that. On the Node backend this is called once at
// startup (server.js); a Worker has no equivalent boot hook, so this is
// instead applied once via wrangler d1 execute during deployment setup
// (see worker/DEPLOY.md) rather than run on every request.
export async function ensureTestSpaceExists(env) {
  const existing = await getSpaceById(env, TEST_SPACE_ID);
  if (existing) return existing;
  return createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', status: 'developing' });
}

export async function createRelationalSpace(env, { title, spaceIds }) {
  const space = await createSpace(env, { title, tags: ['relational'] });
  await addBlockToSpace(env, space.id, { type: 'text', content: { tag: null, text: '' } });
  for (const targetSpaceId of spaceIds) {
    await addBlockToSpace(env, space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  }
  return { ...(await getSpaceById(env, space.id)), changeSummary: space.changeSummary };
}
