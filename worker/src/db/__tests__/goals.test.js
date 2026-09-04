import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  listGoals,
  listGoalsIndex,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
  updateSpaceGoals,
} from '../goals.js';
import { createProject } from '../projects.js';
import { createSpace, getSpaceById } from '../spaces.js';
import { listTrash } from '../trash.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('goals.js', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates a Goal with a change summary and reads it back', async () => {
    const goal = await createGoal(env, { name: 'Understand feedback systems', note: 'A direction, not a task' });
    expect(goal.name).toBe('Understand feedback systems');
    expect(goal.note).toBe('A direction, not a task');
    expect(goal.changeSummary).toContain('Understand feedback systems');
    expect((await getGoalById(env, goal.id)).name).toBe('Understand feedback systems');
    expect(await listGoals(env)).toHaveLength(1);
  });

  it('updates only the fields it is given', async () => {
    const goal = await createGoal(env, { name: 'Original', note: 'Keep me' });
    const updated = await updateGoal(env, goal.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.note).toBe('Keep me');
  });

  it('returns null when updating a Goal that does not exist', async () => {
    expect(await updateGoal(env, 'nonexistent', { name: 'x' })).toBeNull();
  });

  it('a Space can work toward several Goals, and a Goal reach several Spaces', async () => {
    const a = await createGoal(env, { name: 'Goal A' });
    const b = await createGoal(env, { name: 'Goal B' });
    const one = await createSpace(env, { title: 'Space One' });
    const two = await createSpace(env, { title: 'Space Two' });

    await updateSpaceGoals(env, one.id, [a.id, b.id]);
    await updateSpaceGoals(env, two.id, [a.id]);

    expect((await getSpaceById(env, one.id)).goalIds).toEqual([a.id, b.id]);

    const index = await listGoalsIndex(env);
    const rowA = index.find((row) => row.id === a.id);
    const rowB = index.find((row) => row.id === b.id);
    expect(rowA.spaces.map((s) => s.spaceTitle).sort()).toEqual(['Space One', 'Space Two']);
    expect(rowB.spaces.map((s) => s.spaceTitle)).toEqual(['Space One']);
  });

  it('the index shows which Projects serve each Goal', async () => {
    const goal = await createGoal(env, { name: 'Understand feedback systems' });
    await createProject(env, { name: 'Read the book', goalId: goal.id });
    await createProject(env, { name: 'Unrelated work' });

    const [row] = await listGoalsIndex(env);
    expect(row.projects.map((p) => p.projectName)).toEqual(['Read the book']);
  });

  it('an empty database indexes to nothing rather than throwing', async () => {
    expect(await listGoalsIndex(env)).toEqual([]);
  });

  it('updateSpaceGoals returns null for a Space that does not exist', async () => {
    expect(await updateSpaceGoals(env, 'nonexistent', [])).toBeNull();
  });

  it('deleting a Goal records it to the trash and leaves stale ids alone', async () => {
    const goal = await createGoal(env, { name: 'Doomed' });
    const space = await createSpace(env, { title: 'Still pointing at it' });
    await updateSpaceGoals(env, space.id, [goal.id]);

    expect(await deleteGoal(env, goal.id)).toBe(true);
    expect(await getGoalById(env, goal.id)).toBeNull();
    expect((await listTrash(env)).some((row) => row.kind === 'goal' && row.label === 'Doomed')).toBe(true);
    // Same graceful handling a removed Workspace or Category gets --
    // the id simply stops resolving to anything.
    expect((await getSpaceById(env, space.id)).goalIds).toEqual([goal.id]);
  });

  it('deleting a nonexistent Goal reports false rather than throwing', async () => {
    expect(await deleteGoal(env, 'nonexistent')).toBe(false);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM goals').first()).n).toBe(0);
  });
});
