// --- Goals -----------------------------------------------------------
// A pursuit that several Spaces can be working toward at once.
//
// Distinct from a Project by intent, in the person's own words:
// "projects are personally initiated, goals are revealed as relevant
// pursuits." So a Goal deliberately has no Milestones or Sessions of
// its own -- give it those and it just becomes a Project with a
// different name. What it has instead is reach: which Spaces are
// working toward it, and which Projects are serving it.
//
// This replaces the single free-text `spaces.goal` line, which could
// only ever hold one thing. That column is retained but no longer read
// (see the schema), same treatment `spaces.accent` got.

import { TEST_SPACE_ID } from './constants.js';
import { recordTrash } from './trash.js';

export async function listGoals(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM goals ORDER BY created_at ASC`).all();
  return results;
}

export async function getGoalById(env, id) {
  return env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first();
}

export async function createGoal(env, { name, note = null }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO goals (id, name, note) VALUES (?, ?, ?)`).bind(id, name, note).run();
  return { ...(await getGoalById(env, id)), changeSummary: `Created Goal "${name}"` };
}

export async function updateGoal(env, id, { name, note }) {
  const existing = await getGoalById(env, id);
  if (!existing) return null;
  await env.DB.prepare(`UPDATE goals SET name = ?, note = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(name === undefined ? existing.name : name, note === undefined ? existing.note : note, id)
    .run();
  return getGoalById(env, id);
}

// Deleting a Goal leaves a stale id in any Space's goal_ids or Project's
// goal_id, exactly how a removed Workspace or Category is already
// handled -- nothing resolves to it, and nothing crashes.
export async function deleteGoal(env, id) {
  const existing = await getGoalById(env, id);
  if (!existing) return false;
  const rows = (await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).all()).results;
  await recordTrash(env, {
    kind: 'goal',
    label: existing.name || '(untitled)',
    context: null,
    payload: { goals: rows },
  });
  await env.DB.prepare(`DELETE FROM goals WHERE id = ?`).bind(id).run();
  return true;
}

// Which Spaces are working toward this Goal, and which Projects serve
// it -- the two things that make a Goal worth looking at as a whole.
// Batched across every Goal rather than queried one at a time, the same
// approach listResourcesIndex and listAllWorkspaces already use.
export async function listGoalsIndex(env) {
  const goals = await listGoals(env);
  if (goals.length === 0) return [];

  const spaceRows = (
    await env.DB.prepare(
      `SELECT goal.value AS goal_id, spaces.id AS space_id, spaces.title AS space_title
         FROM spaces
         JOIN json_each(spaces.goal_ids) AS goal
        WHERE spaces.id != ?`
    )
      .bind(TEST_SPACE_ID)
      .all()
  ).results;

  const projectRows = (
    await env.DB.prepare(`SELECT id, name, goal_id FROM projects WHERE goal_id IS NOT NULL`).all()
  ).results;

  const spacesByGoal = new Map();
  spaceRows.forEach((row) => {
    if (!spacesByGoal.has(row.goal_id)) spacesByGoal.set(row.goal_id, []);
    spacesByGoal.get(row.goal_id).push({ spaceId: row.space_id, spaceTitle: row.space_title });
  });

  const projectsByGoal = new Map();
  projectRows.forEach((row) => {
    if (!projectsByGoal.has(row.goal_id)) projectsByGoal.set(row.goal_id, []);
    projectsByGoal.get(row.goal_id).push({ projectId: row.id, projectName: row.name });
  });

  return goals.map((goal) => ({
    ...goal,
    spaces: spacesByGoal.get(goal.id) || [],
    projects: projectsByGoal.get(goal.id) || [],
  }));
}

// A Space works toward any number of Goals. Stored as a JSON array on
// the Space, the same many-to-many shape tags and block workspaces use.
export async function updateSpaceGoals(env, spaceId, goalIds) {
  const space = await env.DB.prepare(`SELECT id FROM spaces WHERE id = ?`).bind(spaceId).first();
  if (!space) return null;
  await env.DB.prepare(`UPDATE spaces SET goal_ids = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(goalIds), spaceId)
    .run();
  return env.DB.prepare(`SELECT goal_ids FROM spaces WHERE id = ?`).bind(spaceId).first();
}
