import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
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
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('goals.js', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates a Goal with a change summary and reads it back', () => {
    const goal = createGoal({ name: 'Understand feedback systems', note: 'A direction, not a task' });
    expect(goal.name).toBe('Understand feedback systems');
    expect(goal.note).toBe('A direction, not a task');
    expect(goal.changeSummary).toContain('Understand feedback systems');
    expect(getGoalById(goal.id).name).toBe('Understand feedback systems');
    expect(listGoals()).toHaveLength(1);
  });

  it('updates only the fields it is given', () => {
    const goal = createGoal({ name: 'Original', note: 'Keep me' });
    const updated = updateGoal(goal.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.note).toBe('Keep me');
  });

  it('returns null when updating a Goal that does not exist', () => {
    expect(updateGoal('nonexistent', { name: 'x' })).toBeNull();
  });

  // A Space works toward any number of Goals at once -- the whole
  // reason Goals replaced the single free-text `goal` line.
  it('a Space can work toward several Goals, and a Goal reach several Spaces', () => {
    const a = createGoal({ name: 'Goal A' });
    const b = createGoal({ name: 'Goal B' });
    const one = createSpace({ title: 'Space One' });
    const two = createSpace({ title: 'Space Two' });

    updateSpaceGoals(one.id, [a.id, b.id]);
    updateSpaceGoals(two.id, [a.id]);

    expect(getSpaceById(one.id).goalIds).toEqual([a.id, b.id]);

    const index = listGoalsIndex();
    const rowA = index.find((row) => row.id === a.id);
    const rowB = index.find((row) => row.id === b.id);
    expect(rowA.spaces.map((s) => s.spaceTitle).sort()).toEqual(['Space One', 'Space Two']);
    expect(rowB.spaces.map((s) => s.spaceTitle)).toEqual(['Space One']);
  });

  it('the index shows which Projects serve each Goal', () => {
    const goal = createGoal({ name: 'Understand feedback systems' });
    createProject({ name: 'Read the book', goalId: goal.id });
    createProject({ name: 'Unrelated work' });

    const [row] = listGoalsIndex();
    expect(row.projects.map((p) => p.projectName)).toEqual(['Read the book']);
  });

  it('an empty database indexes to nothing rather than throwing', () => {
    expect(listGoalsIndex()).toEqual([]);
  });

  it('updateSpaceGoals returns null for a Space that does not exist', () => {
    expect(updateSpaceGoals('nonexistent', [])).toBeNull();
  });

  it('deleting a Goal records it to the trash and leaves stale ids alone', () => {
    const goal = createGoal({ name: 'Doomed' });
    const space = createSpace({ title: 'Still pointing at it' });
    updateSpaceGoals(space.id, [goal.id]);

    expect(deleteGoal(goal.id)).toBe(true);
    expect(getGoalById(goal.id)).toBeUndefined();
    expect(listTrash().some((row) => row.kind === 'goal' && row.label === 'Doomed')).toBe(true);
    // Same graceful handling a removed Workspace or Category gets --
    // the id simply stops resolving to anything.
    expect(getSpaceById(space.id).goalIds).toEqual([goal.id]);
  });

  it('deleting a nonexistent Goal reports false rather than throwing', () => {
    expect(deleteGoal('nonexistent')).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM goals').get().n).toBe(0);
  });
});
