import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  listProjects,
  listProjectBlocks,
  listProjectsForSpace,
  listProjectsIndex,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../projects.js';
import { createGoal } from '../goals.js';
import { createSpace } from '../spaces.js';
import { updateBlockProject, createBlock } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('projects.js', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('creates a standalone Project and logs activity', () => {
    const project = createProject({ name: 'Ship the redesign' });
    expect(project.name).toBe('Ship the redesign');
    expect(project.goal_id).toBeNull();
    const logged = db.prepare(`SELECT * FROM activity_log WHERE kind = 'project_created'`).all();
    expect(logged).toHaveLength(1);
  });

  it('can name the Goal it serves', () => {
    const goal = createGoal({ name: 'Understand feedback systems' });
    const project = createProject({ name: 'Read the book', goalId: goal.id });
    expect(project.goal_id).toBe(goal.id);
  });

  // The whole point of the inversion: a Project's Spaces are wherever
  // its member entries happen to live, not a stored owner.
  it('lists a Space only the Projects its own entries were assigned to', () => {
    const other = createSpace({ title: 'Other Space' });
    const mine = createProject({ name: 'Mine' });
    const theirs = createProject({ name: 'Not mine' });

    const here = createBlock({ spaceId: space.id, type: 'milestone', content: {} });
    updateBlockProject(here.id, mine.id);
    const there = createBlock({ spaceId: other.id, type: 'milestone', content: {} });
    updateBlockProject(there.id, theirs.id);

    expect(listProjectsForSpace(space.id).map((p) => p.name)).toEqual(['Mine']);
    expect(listProjectsForSpace(other.id).map((p) => p.name)).toEqual(['Not mine']);
    expect(listProjects().map((p) => p.name).sort()).toEqual(['Mine', 'Not mine']);
  });

  it('one Project can span several Spaces', () => {
    const other = createSpace({ title: 'Other Space' });
    const project = createProject({ name: 'Spans both' });
    const a = createBlock({ spaceId: space.id, type: 'milestone', content: {} });
    const b = createBlock({ spaceId: other.id, type: 'session', content: {} });
    updateBlockProject(a.id, project.id);
    updateBlockProject(b.id, project.id);

    expect(listProjectsForSpace(space.id).map((p) => p.name)).toEqual(['Spans both']);
    expect(listProjectsForSpace(other.id).map((p) => p.name)).toEqual(['Spans both']);
  });

  it('lists every entry assigned to it, wherever it lives, with its Space title', () => {
    const other = createSpace({ title: 'Other Space' });
    const project = createProject({ name: 'Spans both' });
    const a = createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Here' } });
    const b = createBlock({ spaceId: other.id, type: 'session', content: { label: 'There' } });
    const unrelated = createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Loose' } });
    updateBlockProject(a.id, project.id);
    updateBlockProject(b.id, project.id);

    const members = listProjectBlocks(project.id);
    expect(members.map((m) => m.content.label).sort()).toEqual(['Here', 'There']);
    expect(members.map((m) => m.spaceTitle).sort()).toEqual(['A Space', 'Other Space']);
    // Content and properties come back parsed, same as any other
    // block-reading function in this module.
    expect(members[0].properties.projectId).toBe(project.id);
    expect(members.some((m) => m.id === unrelated.id)).toBe(false);
  });

  it('renames a Project in place, and can be re-pointed at another Goal', () => {
    const goal = createGoal({ name: 'A pursuit' });
    const project = createProject({ name: 'Old name' });
    expect(updateProject(project.id, { name: 'New name' }).name).toBe('New name');
    expect(updateProject(project.id, { goalId: goal.id }).goal_id).toBe(goal.id);
    // Naming only one field leaves the other exactly as it was.
    expect(getProjectById(project.id).name).toBe('New name');
  });

  it('the index carries derived Spaces, progress and the Goal name', () => {
    const goal = createGoal({ name: 'Understand feedback systems' });
    const project = createProject({ name: 'Read the book', goalId: goal.id });
    const reached = createBlock({ spaceId: space.id, type: 'milestone', content: { reached: true } });
    const unreached = createBlock({ spaceId: space.id, type: 'milestone', content: { reached: false } });
    const session = createBlock({ spaceId: space.id, type: 'session', content: { durationMinutes: 45 } });
    [reached, unreached, session].forEach((block) => updateBlockProject(block.id, project.id));

    const [row] = listProjectsIndex();
    expect(row.goalName).toBe('Understand feedback systems');
    expect(row.spaces.map((s) => s.spaceTitle)).toEqual(['A Space']);
    expect(row.milestoneCount).toBe(2);
    expect(row.reachedCount).toBe(1);
    expect(row.minutesLogged).toBe(45);
  });

  it('a Project with no entries yet still lists, with nothing derived', () => {
    createProject({ name: 'Not started' });
    const [row] = listProjectsIndex();
    expect(row.spaces).toEqual([]);
    expect(row.milestoneCount).toBe(0);
  });

  it('deleting a Project removes the row but leaves its blocks in place', () => {
    const project = createProject({ name: 'Doomed' });
    const block = createBlock({ spaceId: space.id, type: 'milestone', content: {} });
    updateBlockProject(block.id, project.id);

    deleteProject(project.id);

    expect(getProjectById(project.id)).toBeUndefined();
    const survivingBlock = db.prepare('SELECT * FROM blocks WHERE id = ?').get(block.id);
    expect(survivingBlock).toBeTruthy();
    // The block's own stale project id is left exactly as-is -- same
    // "graceful, do-nothing" handling a removed Workspace/Category gets.
    expect(JSON.parse(survivingBlock.properties).projectId).toBe(project.id);
  });

  it('deleting a nonexistent Project does not throw', () => {
    expect(() => deleteProject('nonexistent')).not.toThrow();
  });
});
