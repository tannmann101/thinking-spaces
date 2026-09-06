// --- Workspaces ---------------------------------------------------------
// A Workspace is a deliberately assembled, named environment inside one
// Space, bundling whichever existing Tools (blocks) belong together for
// focused engagement -- its own dedicated page (unlike a Category, which
// is just a filter over the ordinary feed). Creating/renaming/deleting
// one, and adding/removing a block from one, are all ordinary, always-
// available actions -- no separate mode to switch into, same principle
// as everything else in this app.

import { logActivity } from './activityLog.js';
import { createBlock, nextPosition } from './blocks.js';
import { recordTrash } from './trash.js';

export async function listWorkspacesForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(`SELECT * FROM workspaces WHERE space_id = ? ORDER BY created_at ASC`)
    .bind(spaceId)
    .all();
  return results;
}

export async function getWorkspaceById(env, id) {
  return env.DB.prepare(`SELECT * FROM workspaces WHERE id = ?`).bind(id).first();
}

// `kind` names one of the specialized environments defined in
// frontend/src/registry/workspaceKinds.js -- the kinds themselves live
// there, not here, because a kind carries page layout and framing copy
// that a database row can't hold. This side only stores which one this
// is. Null is a plain, unkinded Workspace, exactly what every Workspace
// was before kinds existed.
//
// `starterBlocks` is what that kind starts you with. The frontend reads
// them off the registry and passes them in, so they're created in the
// same request as the Workspace itself and already carry its id in their
// own properties.workspaces -- rather than the page having to create the
// Workspace, then loop a second round of requests to fill it.
export async function createWorkspace(env, { spaceId, name, kind = null, starterBlocks = [] }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO workspaces (id, space_id, name, kind) VALUES (?, ?, ?, ?)`)
    .bind(id, spaceId, name, kind)
    .run();

  for (const spec of starterBlocks) {
    await createBlock(env, {
      spaceId,
      type: spec.type,
      content: spec.content ?? {},
      properties: { ...spec.properties, workspaces: [id] },
      position: await nextPosition(env, spaceId),
    });
  }

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
// Category is handled today. Nothing crashes; the frontend simply
// doesn't find a matching Workspace to show a chip for anymore.
export async function deleteWorkspace(env, id) {
  const existing = await getWorkspaceById(env, id);
  if (existing) {
    const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(existing.space_id).first();
    await recordTrash(env, {
      kind: 'workspace',
      label: existing.name,
      context: space?.title ?? null,
      payload: { workspaces: [existing] },
    });
  }
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

// Every Workspace across every Space, for the top-level Workspaces page's
// directory. Counts members with the same json_each membership test
// updateBlockWorkspaces writes -- one query rather than one per
// Workspace, the same approach listOverdueReviews already uses for its
// own cross-Space read.
export async function listAllWorkspaces(env) {
  const { results } = await env.DB.prepare(
    `SELECT workspaces.id,
            workspaces.space_id,
            workspaces.name,
            workspaces.kind,
            workspaces.created_at,
            workspaces.updated_at,
            spaces.title AS space_title,
            (SELECT COUNT(*)
               FROM blocks
              WHERE blocks.space_id = workspaces.space_id
                AND EXISTS (
                  SELECT 1 FROM json_each(json_extract(blocks.properties, '$.workspaces'))
                   WHERE json_each.value = workspaces.id
                )) AS member_count
       FROM workspaces
       JOIN spaces ON spaces.id = workspaces.space_id
      ORDER BY workspaces.created_at DESC`
  ).all();
  return results;
}
