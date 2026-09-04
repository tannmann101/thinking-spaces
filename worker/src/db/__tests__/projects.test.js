import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
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
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('projects.js', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('creates a standalone Project and logs activity', async () => {
    const project = await createProject(env, { name: 'Ship the redesign' });
    expect(project.name).toBe('Ship the redesign');
    expect(project.goal_id).toBeNull();
    const { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'project_created'`).all();
    expect(results).toHaveLength(1);
  });

  it('can name the Goal it serves', async () => {
    const goal = await createGoal(env, { name: 'Understand feedback systems' });
    const project = await createProject(env, { name: 'Read the book', goalId: goal.id });
    expect(project.goal_id).toBe(goal.id);
  });

  // The whole point of the inversion: a Project's Spaces are wherever
  // its member entries happen to live, not a stored owner.
  it('lists a Space only the Projects its own entries were assigned to', async () => {
    const other = await createSpace(env, { title: 'Other Space' });
    const mine = await createProject(env, { name: 'Mine' });
    const theirs = await createProject(env, { name: 'Not mine' });

    const here = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {} });
    await updateBlockProject(env, here.id, mine.id);
    const there = await createBlock(env, { spaceId: other.id, type: 'milestone', content: {} });
    await updateBlockProject(env, there.id, theirs.id);

    expect((await listProjectsForSpace(env, space.id)).map((p) => p.name)).toEqual(['Mine']);
    expect((await listProjectsForSpace(env, other.id)).map((p) => p.name)).toEqual(['Not mine']);
    expect((await listProjects(env)).map((p) => p.name).sort()).toEqual(['Mine', 'Not mine']);
  });

  it('one Project can span several Spaces', async () => {
    const other = await createSpace(env, { title: 'Other Space' });
    const project = await createProject(env, { name: 'Spans both' });
    const a = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {} });
    const b = await createBlock(env, { spaceId: other.id, type: 'session', content: {} });
    await updateBlockProject(env, a.id, project.id);
    await updateBlockProject(env, b.id, project.id);

    expect((await listProjectsForSpace(env, space.id)).map((p) => p.name)).toEqual(['Spans both']);
    expect((await listProjectsForSpace(env, other.id)).map((p) => p.name)).toEqual(['Spans both']);
  });

  it('lists every entry assigned to it, wherever it lives, with its Space title', async () => {
    const other = await createSpace(env, { title: 'Other Space' });
    const project = await createProject(env, { name: 'Spans both' });
    const a = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Here' } });
    const b = await createBlock(env, { spaceId: other.id, type: 'session', content: { label: 'There' } });
    const unrelated = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Loose' } });
    await updateBlockProject(env, a.id, project.id);
    await updateBlockProject(env, b.id, project.id);

    const members = await listProjectBlocks(env, project.id);
    expect(members.map((m) => m.content.label).sort()).toEqual(['Here', 'There']);
    expect(members.map((m) => m.spaceTitle).sort()).toEqual(['A Space', 'Other Space']);
    expect(members[0].properties.projectId).toBe(project.id);
    expect(members.some((m) => m.id === unrelated.id)).toBe(false);
  });

  it('renames a Project in place, and can be re-pointed at another Goal', async () => {
    const goal = await createGoal(env, { name: 'A pursuit' });
    const project = await createProject(env, { name: 'Old name' });
    expect((await updateProject(env, project.id, { name: 'New name' })).name).toBe('New name');
    expect((await updateProject(env, project.id, { goalId: goal.id })).goal_id).toBe(goal.id);
    expect((await getProjectById(env, project.id)).name).toBe('New name');
  });

  it('the index carries derived Spaces, progress and the Goal name', async () => {
    const goal = await createGoal(env, { name: 'Understand feedback systems' });
    const project = await createProject(env, { name: 'Read the book', goalId: goal.id });
    const reached = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { reached: true } });
    const unreached = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { reached: false } });
    const session = await createBlock(env, { spaceId: space.id, type: 'session', content: { durationMinutes: 45 } });
    for (const block of [reached, unreached, session]) {
      await updateBlockProject(env, block.id, project.id);
    }

    const [row] = await listProjectsIndex(env);
    expect(row.goalName).toBe('Understand feedback systems');
    expect(row.spaces.map((s) => s.spaceTitle)).toEqual(['A Space']);
    expect(row.milestoneCount).toBe(2);
    expect(row.reachedCount).toBe(1);
    expect(row.minutesLogged).toBe(45);
  });

  it('a Project with no entries yet still lists, with nothing derived', async () => {
    await createProject(env, { name: 'Not started' });
    const [row] = await listProjectsIndex(env);
    expect(row.spaces).toEqual([]);
    expect(row.milestoneCount).toBe(0);
  });

  it('deleting a Project removes the row but leaves its blocks in place', async () => {
    const project = await createProject(env, { name: 'Doomed' });
    const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {} });
    await updateBlockProject(env, block.id, project.id);

    await deleteProject(env, project.id);

    expect(await getProjectById(env, project.id)).toBeNull();
    const survivingBlock = await env.DB.prepare('SELECT * FROM blocks WHERE id = ?').bind(block.id).first();
    expect(survivingBlock).toBeTruthy();
    // The block's own stale project id is left exactly as-is -- same
    // "graceful, do-nothing" handling a removed Workspace/Category gets.
    expect(JSON.parse(survivingBlock.properties).projectId).toBe(project.id);
  });

  it('deleting a nonexistent Project does not throw', async () => {
    await expect(deleteProject(env, 'nonexistent')).resolves.not.toThrow();
  });
});
