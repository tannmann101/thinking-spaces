import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';
import { recordTrash } from './trash.js';

// --- Projects ---------------------------------------------------------
// A Project is a real, named piece of work you decided to take on, that
// a Milestone or Session belongs to. It is *personally initiated*, which
// is what distinguishes it from a Goal (see goals.js) -- a Goal is a
// pursuit you notice you're heading toward. A Project can name the Goal
// it serves, which is how you see whether the work you scheduled is
// actually feeding the direction you found yourself in.
//
// A Project no longer belongs to one Space. Its member entries live in
// whatever Spaces they were created in, so a Project's Spaces are simply
// *whichever those turn out to be* -- derived, never stored. That means
// assigning an entry to a Project stays the only action there is, and a
// Project can span Spaces without a second thing to keep in sync.
// `projects.space_id` is gone. Unlike `spaces.accent`, it could not
// simply be left in place and ignored: it carried NOT NULL plus a
// foreign key into spaces, so a standalone Project could not be
// inserted at all while it existed. migrateProjectsSpaceless() below
// rebuilds the table for any database created before this change.
//
// A block joins a Project via a single `projectId` in its own
// `properties` (see updateBlockProject in blocks.js), not an array the
// way Workspace membership is -- a checkpoint or a timed sitting most
// naturally serves one project at a time.

// Every Project whose work actually happens in this Space -- derived
// from where its member entries live rather than from stored ownership.
// A Space "pulls in" the Projects it is contributing to.
export function listProjectsForSpace(spaceId) {
  return db
    .prepare(
      `SELECT DISTINCT projects.*
         FROM projects
         JOIN blocks ON json_extract(blocks.properties, '$.projectId') = projects.id
        WHERE blocks.space_id = ?
        ORDER BY projects.created_at ASC`
    )
    .all(spaceId);
}

export function listProjects() {
  return db.prepare(`SELECT * FROM projects ORDER BY created_at ASC`).all();
}

export function getProjectById(id) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
}

// Created standalone -- a Project gains Spaces by having entries
// assigned to it, not by being told which Space it lives in.
export function createProject({ name, goalId = null }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO projects (id, name, goal_id) VALUES (?, ?, ?)`).run(id, name, goalId);
  const summary = `Created Project "${name}"`;
  logActivity({ spaceId: null, spaceTitle: null, kind: 'project_created', summary });
  return { ...getProjectById(id), changeSummary: summary };
}

export function updateProject(id, { name, goalId }) {
  const existing = getProjectById(id);
  if (!existing) return null;
  db.prepare(`UPDATE projects SET name = ?, goal_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    name === undefined ? existing.name : name,
    goalId === undefined ? existing.goal_id : goalId || null,
    id
  );
  return getProjectById(id);
}

// Deleting a Project only ever removes the projects row itself -- any
// block that pointed at this id via properties.projectId just ends up
// with a stale id nothing resolves to, exactly how a removed Workspace
// or Category is already handled. Nothing crashes; the frontend simply
// doesn't find a matching Project to show a chip for anymore.
export function deleteProject(id) {
  const trashed = getProjectById(id);
  if (trashed) {
    recordTrash({
      kind: 'project',
      label: trashed.name || '(untitled)',
      context: null,
      payload: { projects: db.prepare(`SELECT * FROM projects WHERE id = ?`).all(id) },
    });
  }
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  if (trashed) {
    logActivity({
      spaceId: null,
      spaceTitle: null,
      kind: 'project_deleted',
      summary: `Deleted Project "${trashed.name}"`,
    });
  }
}

// Every Project, with the two things that make the index worth having:
// where its work actually happens (derived from its member entries) and
// how far it has got. Batched across every Project rather than queried
// one at a time, same approach listResourcesIndex already uses.
export function listProjectsIndex() {
  const projects = listProjects();
  if (projects.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT json_extract(blocks.properties, '$.projectId') AS project_id,
              blocks.type AS type,
              blocks.content AS content,
              spaces.id AS space_id,
              spaces.title AS space_title
         FROM blocks
         JOIN spaces ON spaces.id = blocks.space_id
        WHERE json_extract(blocks.properties, '$.projectId') IS NOT NULL`
    )
    .all();

  const goalNameById = new Map(db.prepare(`SELECT id, name FROM goals`).all().map((g) => [g.id, g.name]));

  const byProject = new Map();
  rows.forEach((row) => {
    if (!byProject.has(row.project_id)) {
      byProject.set(row.project_id, { spaces: new Map(), milestones: 0, reached: 0, minutes: 0 });
    }
    const bucket = byProject.get(row.project_id);
    bucket.spaces.set(row.space_id, { spaceId: row.space_id, spaceTitle: row.space_title });
    const content = JSON.parse(row.content);
    if (row.type === 'milestone') {
      bucket.milestones += 1;
      if (content.reached) bucket.reached += 1;
    }
    if (row.type === 'session') bucket.minutes += content.durationMinutes || 0;
  });

  return projects.map((project) => {
    const bucket = byProject.get(project.id) || { spaces: new Map(), milestones: 0, reached: 0, minutes: 0 };
    return {
      ...project,
      goalName: project.goal_id ? goalNameById.get(project.goal_id) ?? null : null,
      spaces: [...bucket.spaces.values()],
      milestoneCount: bucket.milestones,
      reachedCount: bucket.reached,
      minutesLogged: bucket.minutes,
    };
  });
}


// One-time migration for databases created before Projects were
// inverted. SQLite cannot drop a column that carries a foreign key, so
// this is the standard rebuild: make the new shape, copy the rows
// across, swap it in. Idempotent -- it checks for the old column first
// and does nothing once the table is already the new shape.
export function migrateProjectsSpaceless() {
  const columns = db.prepare(`PRAGMA table_info(projects)`).all();
  if (!columns.some((column) => column.name === 'space_id')) return false;

  const hasGoalId = columns.some((column) => column.name === 'goal_id');
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE projects_rebuilt (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(
      `INSERT INTO projects_rebuilt (id, name, goal_id, created_at, updated_at)
       SELECT id, name, ${hasGoalId ? 'goal_id' : 'NULL'}, created_at, updated_at FROM projects;`
    );
    db.exec(`DROP TABLE projects;`);
    db.exec(`ALTER TABLE projects_rebuilt RENAME TO projects;`);
  });
  rebuild();
  return true;
}
