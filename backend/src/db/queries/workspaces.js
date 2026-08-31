import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';

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

export function createWorkspace({ spaceId, name }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, space_id, name) VALUES (?, ?, ?)`).run(id, spaceId, name);
  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(spaceId);
  logActivity({
    spaceId,
    spaceTitle: space?.title ?? null,
    kind: 'workspace_created',
    summary: `Created Workspace "${name}" in "${space?.title ?? spaceId}"`,
  });
  return getWorkspaceById(id);
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
