import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';
import { recordTrash } from './trash.js';

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

export function listGoals() {
  return db.prepare(`SELECT * FROM goals ORDER BY created_at ASC`).all();
}

export function getGoalById(id) {
  return db.prepare(`SELECT * FROM goals WHERE id = ?`).get(id);
}

export function createGoal({ name, note = null }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO goals (id, name, note) VALUES (?, ?, ?)`).run(id, name, note);
  return { ...getGoalById(id), changeSummary: `Created Goal "${name}"` };
}

export function updateGoal(id, { name, note }) {
  const existing = getGoalById(id);
  if (!existing) return null;
  db.prepare(`UPDATE goals SET name = ?, note = ?, updated_at = datetime('now') WHERE id = ?`).run(
    name === undefined ? existing.name : name,
    note === undefined ? existing.note : note,
    id
  );
  return getGoalById(id);
}

// Deleting a Goal leaves a stale id in any Space's goal_ids or Project's
// goal_id, exactly how a removed Workspace or Category is already
// handled -- nothing resolves to it, and nothing crashes.
export function deleteGoal(id) {
  const existing = getGoalById(id);
  if (!existing) return false;
  recordTrash({
    kind: 'goal',
    label: existing.name || '(untitled)',
    context: null,
    payload: { goals: db.prepare(`SELECT * FROM goals WHERE id = ?`).all(id) },
  });
  db.prepare(`DELETE FROM goals WHERE id = ?`).run(id);
  return true;
}

// Which Spaces are working toward this Goal, and which Projects serve
// it -- the two things that make a Goal worth looking at as a whole.
// Batched across every Goal rather than queried one at a time, the same
// approach listResourcesIndex and listAllWorkspaces already use.
export function listGoalsIndex() {
  const goals = listGoals();
  if (goals.length === 0) return [];

  const spaceRows = db
    .prepare(
      `SELECT goal.value AS goal_id, spaces.id AS space_id, spaces.title AS space_title
         FROM spaces
         JOIN json_each(spaces.goal_ids) AS goal
        WHERE spaces.id != ?`
    )
    .all(TEST_SPACE_ID);

  const projectRows = db
    .prepare(`SELECT id, name, goal_id FROM projects WHERE goal_id IS NOT NULL`)
    .all();

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
export function updateSpaceGoals(spaceId, goalIds) {
  const space = db.prepare(`SELECT id FROM spaces WHERE id = ?`).get(spaceId);
  if (!space) return null;
  db.prepare(`UPDATE spaces SET goal_ids = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(goalIds),
    spaceId
  );
  return db.prepare(`SELECT goal_ids FROM spaces WHERE id = ?`).get(spaceId);
}
