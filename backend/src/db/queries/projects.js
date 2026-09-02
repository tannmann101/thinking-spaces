import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';

// --- Projects ---------------------------------------------------------
// A Project is a real, named goal/project inside one Space that a
// Milestone or Session belongs to -- the Time family's own dedicated
// structural concept, mirroring how a Workspace is a dedicated concept
// for bundling Tools. Named "Project" rather than "Goal" specifically
// to avoid colliding with the Space's own pre-existing `goal` field (a
// single free-text "what this Space is working toward" line, shown as
// "Goal: ..." in a Space Report) -- confirmed via direct question
// rather than assumed, once the collision surfaced while wiring this
// into Reports. A block joins a Project via a single `projectId` in its
// own `properties` (see updateBlockProject in blocks.js), not an array
// the way Workspace membership is -- a checkpoint or a timed sitting
// most naturally serves one project at a time.

export function listProjectsForSpace(spaceId) {
  return db.prepare(`SELECT * FROM projects WHERE space_id = ? ORDER BY created_at ASC`).all(spaceId);
}

export function getProjectById(id) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
}

export function createProject({ spaceId, name }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO projects (id, space_id, name) VALUES (?, ?, ?)`).run(id, spaceId, name);
  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(spaceId);
  const summary = `Created Project "${name}" in "${space?.title ?? spaceId}"`;
  logActivity({
    spaceId,
    spaceTitle: space?.title ?? null,
    kind: 'project_created',
    summary,
  });
  return { ...getProjectById(id), changeSummary: summary };
}

export function updateProject(id, { name }) {
  db.prepare(`UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);
  return getProjectById(id);
}

// Deleting a Project only ever removes the projects row itself -- any
// block that pointed at this id via properties.projectId just ends up
// with a stale id nothing resolves to, exactly how a removed Workspace
// or Category is already handled. Nothing crashes; the frontend simply
// doesn't find a matching Project to show a chip for anymore.
export function deleteProject(id) {
  const existing = getProjectById(id);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  if (existing) {
    const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(existing.space_id);
    logActivity({
      spaceId: existing.space_id,
      spaceTitle: space?.title ?? null,
      kind: 'project_deleted',
      summary: `Deleted Project "${existing.name}" from "${space?.title ?? existing.space_id}"`,
    });
  }
}
