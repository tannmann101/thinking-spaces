// Ported from backend/src/db/queries/projects.js.

import { logActivity } from './activityLog.js';

export async function listProjectsForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(`SELECT * FROM projects WHERE space_id = ? ORDER BY created_at ASC`)
    .bind(spaceId)
    .all();
  return results;
}

export async function getProjectById(env, id) {
  return env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
}

export async function createProject(env, { spaceId, name }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO projects (id, space_id, name) VALUES (?, ?, ?)`).bind(id, spaceId, name).run();
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(spaceId).first();
  await logActivity(env, {
    spaceId,
    spaceTitle: space?.title ?? null,
    kind: 'project_created',
    summary: `Created Project "${name}" in "${space?.title ?? spaceId}"`,
  });
  return getProjectById(env, id);
}

export async function updateProject(env, id, { name }) {
  await env.DB.prepare(`UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?`).bind(name, id).run();
  return getProjectById(env, id);
}

// Deleting a Project only ever removes the projects row itself -- any
// block that pointed at this id via properties.projectId just ends up
// with a stale id nothing resolves to, exactly how a removed Workspace
// or Category is already handled.
export async function deleteProject(env, id) {
  const existing = await getProjectById(env, id);
  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  if (existing) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(existing.space_id).first();
    await logActivity(env, {
      spaceId: existing.space_id,
      spaceTitle: space?.title ?? null,
      kind: 'project_deleted',
      summary: `Deleted Project "${existing.name}" from "${space?.title ?? existing.space_id}"`,
    });
  }
}
