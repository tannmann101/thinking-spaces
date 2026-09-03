import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';
import { createBlock, nextPosition } from './blocks.js';
import { recordTrash } from './trash.js';

// --- Workspaces ---------------------------------------------------------
// A Workspace is a deliberately assembled, named environment inside one
// Space, bundling whichever existing Tools (blocks) belong together for
// focused engagement -- its own dedicated page (unlike a Category, which
// is just a filter over the ordinary feed). Creating/renaming/deleting
// one, and adding/removing a block from one, are all ordinary, always-
// available actions -- no separate mode to switch into, same principle
// as everything else in this app.

export function listWorkspacesForSpace(spaceId) {
  return db.prepare(`SELECT * FROM workspaces WHERE space_id = ? ORDER BY created_at ASC`).all(spaceId);
}

export function getWorkspaceById(id) {
  return db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id);
}

// `kind` names one of the specialized environments defined in
// frontend/src/registry/workspaceKinds.js -- the kinds themselves live
// there, not here, because a kind carries page layout and framing copy
// that a database row can't hold. The backend only stores which one this
// is. Null is a plain, unkinded Workspace, exactly what every Workspace
// was before kinds existed.
//
// `starterBlocks` is what that kind starts you with. The frontend reads
// them off the registry and passes them in, so they're created in the
// same request as the Workspace itself and already carry its id in their
// own properties.workspaces -- rather than the page having to create the
// Workspace, then loop a second round of requests to fill it.
export function createWorkspace({ spaceId, name, kind = null, starterBlocks = [] }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, space_id, name, kind) VALUES (?, ?, ?, ?)`).run(
    id,
    spaceId,
    name,
    kind
  );

  starterBlocks.forEach((spec) => {
    createBlock({
      spaceId,
      type: spec.type,
      content: spec.content ?? {},
      properties: { ...spec.properties, workspaces: [id] },
      position: nextPosition(spaceId),
    });
  });

  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(spaceId);
  const summary = `Created Workspace "${name}" in "${space?.title ?? spaceId}"`;
  logActivity({
    spaceId,
    spaceTitle: space?.title ?? null,
    kind: 'workspace_created',
    summary,
  });
  return { ...getWorkspaceById(id), changeSummary: summary };
}

export function updateWorkspace(id, { name }) {
  db.prepare(`UPDATE workspaces SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);
  return getWorkspaceById(id);
}

// Deleting a Workspace only ever removes the workspaces row itself --
// any block that listed this id in its own properties.workspaces just
// ends up with a stale id nothing resolves to, exactly how a removed
// Category is handled today. Nothing crashes; the frontend simply
// doesn't find a matching Workspace to show a chip for anymore.
export function deleteWorkspace(id) {
  const existing = getWorkspaceById(id);
  if (existing) {
    const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(existing.space_id);
    recordTrash({
      kind: 'workspace',
      label: existing.name,
      context: space?.title ?? null,
      payload: { workspaces: [existing] },
    });
  }
  db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
  if (existing) {
    const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(existing.space_id);
    logActivity({
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
export function listAllWorkspaces() {
  return db
    .prepare(
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
    )
    .all();
}
