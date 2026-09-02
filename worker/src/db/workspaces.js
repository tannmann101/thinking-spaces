// Ported from backend/src/db/queries/workspaces.js.

import { logActivity } from './activityLog.js';

export async function listWorkspacesForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(`SELECT * FROM workspaces WHERE space_id = ? ORDER BY created_at ASC`)
    .bind(spaceId)
    .all();
  return results;
}

export async function getWorkspaceById(env, id) {
  return env.DB.prepare(`SELECT * FROM workspaces WHERE id = ?`).bind(id).first();
}

export async function createWorkspace(env, { spaceId, name }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO workspaces (id, space_id, name) VALUES (?, ?, ?)`).bind(id, spaceId, name).run();
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(spaceId).first();
  const summary = `Created Workspace "${name}" in "${space?.title ?? spaceId}"`;
  await logActivity(env, {
    spaceId,
    spaceTitle: space?.title ?? null,
    kind: 'workspace_created',
    summary,
  });
  return { ...(await getWorkspaceById(env, id)), changeSummary: summary };
}

export async function updateWorkspace(env, id, { name }) {
  await env.DB.prepare(`UPDATE workspaces SET name = ?, updated_at = datetime('now') WHERE id = ?`).bind(name, id).run();
  return getWorkspaceById(env, id);
}

// Deleting a Workspace only ever removes the workspaces row itself --
// any block that listed this id in its own properties.workspaces just
// ends up with a stale id nothing resolves to, exactly how a removed
// Category is handled.
export async function deleteWorkspace(env, id) {
  const existing = await getWorkspaceById(env, id);
  await env.DB.prepare(`DELETE FROM workspaces WHERE id = ?`).bind(id).run();
  if (existing) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(existing.space_id).first();
    await logActivity(env, {
      spaceId: existing.space_id,
      spaceTitle: space?.title ?? null,
      kind: 'workspace_deleted',
      summary: `Deleted Workspace "${existing.name}" from "${space?.title ?? existing.space_id}"`,
    });
  }
}
