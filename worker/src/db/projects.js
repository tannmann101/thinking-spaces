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
//
// A Project's Spaces are derived from wherever its member entries live,
// never stored. `projects.space_id` is gone from schema.sql entirely.

import { logActivity } from './activityLog.js';
import { recordTrash } from './trash.js';

// Every Project whose work actually happens in this Space -- derived
// from where its member entries live rather than from stored ownership.
// A Space "pulls in" the Projects it is contributing to.
export async function listProjectsForSpace(env, spaceId) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT projects.*
       FROM projects
       JOIN blocks ON json_extract(blocks.properties, '$.projectId') = projects.id
      WHERE blocks.space_id = ?
      ORDER BY projects.created_at ASC`
  )
    .bind(spaceId)
    .all();
  return results;
}

export async function listProjects(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM projects ORDER BY created_at ASC`).all();
  return results;
}

export async function getProjectById(env, id) {
  return env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
}

// Created standalone -- a Project gains Spaces by having entries
// assigned to it, not by being told which Space it lives in.
export async function createProject(env, { name, goalId = null }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO projects (id, name, goal_id) VALUES (?, ?, ?)`).bind(id, name, goalId).run();
  const summary = `Created Project "${name}"`;
  await logActivity(env, { spaceId: null, spaceTitle: null, kind: 'project_created', summary });
  return { ...(await getProjectById(env, id)), changeSummary: summary };
}

export async function updateProject(env, id, { name, goalId }) {
  const existing = await getProjectById(env, id);
  if (!existing) return null;
  await env.DB.prepare(`UPDATE projects SET name = ?, goal_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(
      name === undefined ? existing.name : name,
      goalId === undefined ? existing.goal_id : goalId || null,
      id
    )
    .run();
  return getProjectById(env, id);
}

// Deleting a Project only ever removes the projects row itself -- any
// block that pointed at this id via properties.projectId just ends up
// with a stale id nothing resolves to, exactly how a removed Workspace
// or Category is already handled. Nothing crashes; the frontend simply
// doesn't find a matching Project to show a chip for anymore.
export async function deleteProject(env, id) {
  const trashed = await getProjectById(env, id);
  if (trashed) {
    const rows = (await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).all()).results;
    await recordTrash(env, {
      kind: 'project',
      label: trashed.name || '(untitled)',
      context: null,
      payload: { projects: rows },
    });
  }
  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  if (trashed) {
    await logActivity(env, {
      spaceId: null,
      spaceTitle: null,
      kind: 'project_deleted',
      summary: `Deleted Project "${trashed.name}"`,
    });
  }
}

// Every entry assigned to this Project, wherever it lives. A Project's
// own page needs this: it has no Space of its own to read a feed from,
// so its members are gathered by projectId across every Space instead.
export async function listProjectBlocks(env, projectId) {
  const { results } = await env.DB.prepare(
    `SELECT blocks.*, spaces.title AS space_title
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
      WHERE json_extract(blocks.properties, '$.projectId') = ?
      ORDER BY spaces.title ASC, blocks.position ASC`
  )
    .bind(projectId)
    .all();
  return results.map((row) => ({
    ...row,
    content: JSON.parse(row.content),
    properties: JSON.parse(row.properties),
    spaceTitle: row.space_title,
  }));
}

// Every Project, with the two things that make the index worth having:
// where its work actually happens (derived from its member entries) and
// how far it has got. Batched across every Project rather than queried
// one at a time, same approach listResourcesIndex already uses.
export async function listProjectsIndex(env) {
  const projects = await listProjects(env);
  if (projects.length === 0) return [];

  const rows = (
    await env.DB.prepare(
      `SELECT json_extract(blocks.properties, '$.projectId') AS project_id,
              blocks.type AS type,
              blocks.content AS content,
              spaces.id AS space_id,
              spaces.title AS space_title
         FROM blocks
         JOIN spaces ON spaces.id = blocks.space_id
        WHERE json_extract(blocks.properties, '$.projectId') IS NOT NULL`
    ).all()
  ).results;

  const goalRows = (await env.DB.prepare(`SELECT id, name FROM goals`).all()).results;
  const goalNameById = new Map(goalRows.map((g) => [g.id, g.name]));

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
