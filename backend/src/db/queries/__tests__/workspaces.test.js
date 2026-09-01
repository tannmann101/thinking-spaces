import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  listWorkspacesForSpace,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '../workspaces.js';
import { createSpace } from '../spaces.js';
import { updateBlockWorkspaces, createBlock } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('workspaces.js', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('creates a Workspace scoped to its Space and logs activity', () => {
    const workspace = createWorkspace({ spaceId: space.id, name: 'Focused Work' });
    expect(workspace.name).toBe('Focused Work');
    expect(workspace.space_id).toBe(space.id);
    const logged = db.prepare(`SELECT * FROM activity_log WHERE kind = 'workspace_created'`).all();
    expect(logged).toHaveLength(1);
  });

  it('lists only Workspaces belonging to the given Space', () => {
    const other = createSpace({ title: 'Other Space' });
    createWorkspace({ spaceId: space.id, name: 'Mine' });
    createWorkspace({ spaceId: other.id, name: 'Not mine' });
    const list = listWorkspacesForSpace(space.id);
    expect(list.map((w) => w.name)).toEqual(['Mine']);
  });

  it('renames a Workspace in place', () => {
    const workspace = createWorkspace({ spaceId: space.id, name: 'Old name' });
    const updated = updateWorkspace(workspace.id, { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect(getWorkspaceById(workspace.id).name).toBe('New name');
  });

  it('deleting a Workspace removes the row but leaves its blocks in place', () => {
    const workspace = createWorkspace({ spaceId: space.id, name: 'Doomed' });
    const block = createBlock({ spaceId: space.id, type: 'text', content: {} });
    updateBlockWorkspaces(block.id, [workspace.id]);

    deleteWorkspace(workspace.id);

    expect(getWorkspaceById(workspace.id)).toBeUndefined();
    const survivingBlock = db.prepare('SELECT * FROM blocks WHERE id = ?').get(block.id);
    expect(survivingBlock).toBeTruthy();
    // The block's own stale workspace id is left exactly as-is -- same
    // "graceful, do-nothing" handling a removed Category gets.
    expect(JSON.parse(survivingBlock.properties).workspaces).toEqual([workspace.id]);
  });

  it('deleting a nonexistent Workspace does not throw', () => {
    expect(() => deleteWorkspace('nonexistent')).not.toThrow();
  });
});
