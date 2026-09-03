import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  listWorkspacesForSpace,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listAllWorkspaces,
} from '../workspaces.js';
import { createSpace } from '../spaces.js';
import { updateBlockWorkspaces, createBlock, listBlocksForSpace } from '../blocks.js';
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

  it('stores a kind, so a Workspace can be a specialized environment', () => {
    const workspace = createWorkspace({ spaceId: space.id, name: 'Etymology', kind: 'etymology' });
    expect(workspace.kind).toBe('etymology');
    expect(getWorkspaceById(workspace.id).kind).toBe('etymology');
  });

  it('leaves kind null for a plain Workspace named by hand', () => {
    expect(createWorkspace({ spaceId: space.id, name: 'Plain' }).kind).toBeNull();
  });

  it('seeds starter blocks already joined to the new Workspace', () => {
    const workspace = createWorkspace({
      spaceId: space.id,
      name: 'Analyst',
      kind: 'analyst',
      starterBlocks: [
        { type: 'text', content: { text: 'Observations' } },
        { type: 'analysis', content: { statement: 'Break it down', support: [], confidence: 'tentative' } },
      ],
    });

    const members = listBlocksForSpace(space.id).filter((block) =>
      (block.properties?.workspaces || []).includes(workspace.id)
    );
    expect(members).toHaveLength(2);
    expect(members.map((block) => block.type).sort()).toEqual(['analysis', 'text']);
  });

  it('gives each starter block its own position rather than stacking them all at one', () => {
    createWorkspace({
      spaceId: space.id,
      name: 'Analyst',
      starterBlocks: [{ type: 'text', content: {} }, { type: 'text', content: {} }, { type: 'text', content: {} }],
    });
    const positions = listBlocksForSpace(space.id).map((block) => block.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('creates no starter blocks when a kind brings none', () => {
    createWorkspace({ spaceId: space.id, name: 'Plain' });
    expect(listBlocksForSpace(space.id)).toHaveLength(0);
  });

  it('lists every Workspace across every Space with its Space title and member count', () => {
    const other = createSpace({ title: 'Another Space' });
    const first = createWorkspace({ spaceId: space.id, name: 'One', kind: 'analyst' });
    createWorkspace({ spaceId: other.id, name: 'Two' });

    const block = createBlock({ spaceId: space.id, type: 'text', content: {}, position: 0 });
    updateBlockWorkspaces(block.id, [first.id]);

    const all = listAllWorkspaces();
    expect(all).toHaveLength(2);
    const one = all.find((workspace) => workspace.name === 'One');
    expect(one.space_title).toBe('A Space');
    expect(one.kind).toBe('analyst');
    expect(one.member_count).toBe(1);
    expect(all.find((workspace) => workspace.name === 'Two').member_count).toBe(0);
  });
});
