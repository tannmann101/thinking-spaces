import { describe, it, expect, beforeEach } from 'vitest';
import { listTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from '../trash.js';
import { createSpace, deleteSpace, getSpaceById } from '../spaces.js';
import { createBlock, deleteBlock, listBlocksForSpace, getBlockById } from '../blocks.js';
import { createWorkspace, listWorkspacesForSpace } from '../workspaces.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('trash', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('starts empty', () => {
    expect(listTrash()).toEqual([]);
  });

  it('records a deleted Space, naming what it was', () => {
    deleteSpace(space.id);
    const entries = listTrash();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'space', label: 'A Space' });
  });

  it('restores a Space with everything that lived inside it', () => {
    createBlock({ spaceId: space.id, type: 'text', content: { lines: [{ id: 'l1', text: 'keep me' }] }, position: 0 });
    createWorkspace({ spaceId: space.id, name: 'Focus' });
    deleteSpace(space.id);
    expect(getSpaceById(space.id)).toBeUndefined();

    restoreFromTrash(listTrash()[0].id);

    expect(getSpaceById(space.id).title).toBe('A Space');
    expect(listBlocksForSpace(space.id)).toHaveLength(1);
    expect(listWorkspacesForSpace(space.id)).toHaveLength(1);
  });

  it('restores rows with their original ids, so anything pointing at them still resolves', () => {
    const block = createBlock({ spaceId: space.id, type: 'text', content: { lines: [] }, position: 0 });
    deleteBlock(block.id);
    restoreFromTrash(listTrash()[0].id);
    expect(getBlockById(block.id)).toBeTruthy();
  });

  it('clears the trash entry once restored, so it cannot be restored twice', () => {
    deleteSpace(space.id);
    restoreFromTrash(listTrash()[0].id);
    expect(listTrash()).toEqual([]);
  });

  it('records a deleted entry against the Space it came from', () => {
    const block = createBlock({ spaceId: space.id, type: 'hypothesis', content: { statement: 'x' }, position: 0 });
    deleteBlock(block.id);
    expect(listTrash()[0]).toMatchObject({ kind: 'block', label: 'hypothesis', context: 'A Space' });
  });

  it('returns null rather than throwing when restoring something that is not there', () => {
    expect(restoreFromTrash('no-such-id')).toBeNull();
  });

  it('purges one entry permanently', () => {
    deleteSpace(space.id);
    const id = listTrash()[0].id;
    expect(purgeTrashEntry(id)).toBe(true);
    expect(listTrash()).toEqual([]);
    expect(getSpaceById(space.id)).toBeUndefined();
  });

  it('reports when there was nothing to purge', () => {
    expect(purgeTrashEntry('no-such-id')).toBe(false);
  });

  it('empties everything and says how much it removed', () => {
    deleteSpace(space.id);
    deleteSpace(createSpace({ title: 'Another' }).id);
    expect(emptyTrash()).toBe(2);
    expect(listTrash()).toEqual([]);
  });

  it('lists most recently deleted first', () => {
    deleteSpace(space.id);
    deleteSpace(createSpace({ title: 'Second' }).id);
    expect(listTrash().map((entry) => entry.label)).toEqual(['Second', 'A Space']);
  });
});
