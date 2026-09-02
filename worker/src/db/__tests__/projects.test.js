import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { listProjectsForSpace, getProjectById, createProject, updateProject, deleteProject } from '../projects.js';
import { createSpace } from '../spaces.js';
import { updateBlockProject, createBlock } from '../blocks.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('projects.js', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('creates a Project scoped to its Space and logs activity', async () => {
    const project = await createProject(env, { spaceId: space.id, name: 'Ship the redesign' });
    expect(project.name).toBe('Ship the redesign');
    expect(project.space_id).toBe(space.id);
    const { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'project_created'`).all();
    expect(results).toHaveLength(1);
  });

  it('lists only Projects belonging to the given Space', async () => {
    const other = await createSpace(env, { title: 'Other Space' });
    await createProject(env, { spaceId: space.id, name: 'Mine' });
    await createProject(env, { spaceId: other.id, name: 'Not mine' });
    const list = await listProjectsForSpace(env, space.id);
    expect(list.map((p) => p.name)).toEqual(['Mine']);
  });

  it('renames a Project in place', async () => {
    const project = await createProject(env, { spaceId: space.id, name: 'Old name' });
    const updated = await updateProject(env, project.id, { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect((await getProjectById(env, project.id)).name).toBe('New name');
  });

  it('deleting a Project removes the row but leaves its blocks in place', async () => {
    const project = await createProject(env, { spaceId: space.id, name: 'Doomed' });
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
