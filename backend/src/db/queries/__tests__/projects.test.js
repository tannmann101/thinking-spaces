import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { listProjectsForSpace, getProjectById, createProject, updateProject, deleteProject } from '../projects.js';
import { createSpace } from '../spaces.js';
import { updateBlockProject, createBlock } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('projects.js', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('creates a Project scoped to its Space and logs activity', () => {
    const project = createProject({ spaceId: space.id, name: 'Ship the redesign' });
    expect(project.name).toBe('Ship the redesign');
    expect(project.space_id).toBe(space.id);
    const logged = db.prepare(`SELECT * FROM activity_log WHERE kind = 'project_created'`).all();
    expect(logged).toHaveLength(1);
  });

  it('lists only Projects belonging to the given Space', () => {
    const other = createSpace({ title: 'Other Space' });
    createProject({ spaceId: space.id, name: 'Mine' });
    createProject({ spaceId: other.id, name: 'Not mine' });
    const list = listProjectsForSpace(space.id);
    expect(list.map((p) => p.name)).toEqual(['Mine']);
  });

  it('renames a Project in place', () => {
    const project = createProject({ spaceId: space.id, name: 'Old name' });
    const updated = updateProject(project.id, { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect(getProjectById(project.id).name).toBe('New name');
  });

  it('deleting a Project removes the row but leaves its blocks in place', () => {
    const project = createProject({ spaceId: space.id, name: 'Doomed' });
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
