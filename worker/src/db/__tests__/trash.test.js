import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { listTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from '../trash.js';
import { createSpace, deleteSpace, getSpaceById } from '../spaces.js';
import { createBlock, deleteBlock, listBlocksForSpace, getBlockById } from '../blocks.js';
import { createWorkspace, listWorkspacesForSpace } from '../workspaces.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('trash', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('starts empty', async () => {
    expect(await listTrash(env)).toEqual([]);
  });

  it('records a deleted Space, naming what it was', async () => {
    await deleteSpace(env, space.id);
    const entries = await listTrash(env);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'space', label: 'A Space' });
  });

  it('restores a Space with everything that lived inside it', async () => {
    await createBlock(env, { spaceId: space.id, type: 'text', content: { lines: [{ id: 'l1', text: 'keep me' }] }, position: 0 });
    await createWorkspace(env, { spaceId: space.id, name: 'Focus' });
    await deleteSpace(env, space.id);
    // D1's .first() returns null where better-sqlite3 returns undefined.
    expect(await getSpaceById(env, space.id)).toBeNull();

    await restoreFromTrash(env, (await listTrash(env))[0].id);

    expect((await getSpaceById(env, space.id)).title).toBe('A Space');
    expect(await listBlocksForSpace(env, space.id)).toHaveLength(1);
    expect(await listWorkspacesForSpace(env, space.id)).toHaveLength(1);
  });

  it('restores rows with their original ids, so anything pointing at them still resolves', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { lines: [] }, position: 0 });
    await deleteBlock(env, block.id);
    await restoreFromTrash(env, (await listTrash(env))[0].id);
    expect(await getBlockById(env, block.id)).toBeTruthy();
  });

  it('clears the trash entry once restored, so it cannot be restored twice', async () => {
    await deleteSpace(env, space.id);
    await restoreFromTrash(env, (await listTrash(env))[0].id);
    expect(await listTrash(env)).toEqual([]);
  });

  it('records a deleted entry against the Space it came from', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'hypothesis', content: { statement: 'x' }, position: 0 });
    await deleteBlock(env, block.id);
    expect((await listTrash(env))[0]).toMatchObject({ kind: 'block', label: 'hypothesis', context: 'A Space' });
  });

  it('returns null rather than throwing when restoring something that is not there', async () => {
    expect(await restoreFromTrash(env, 'no-such-id')).toBeNull();
  });

  it('purges one entry permanently', async () => {
    await deleteSpace(env, space.id);
    const id = (await listTrash(env))[0].id;
    expect(await purgeTrashEntry(env, id)).toBe(true);
    expect(await listTrash(env)).toEqual([]);
    // D1's .first() returns null where better-sqlite3 returns undefined.
    expect(await getSpaceById(env, space.id)).toBeNull();
  });

  it('reports when there was nothing to purge', async () => {
    expect(await purgeTrashEntry(env, 'no-such-id')).toBe(false);
  });

  it('empties everything and says how much it removed', async () => {
    await deleteSpace(env, space.id);
    await deleteSpace(env, (await createSpace(env, { title: 'Another' })).id);
    expect(await emptyTrash(env)).toBe(2);
    expect(await listTrash(env)).toEqual([]);
  });

  it('lists most recently deleted first', async () => {
    await deleteSpace(env, space.id);
    await deleteSpace(env, (await createSpace(env, { title: 'Second' })).id);
    expect((await listTrash(env)).map((entry) => entry.label)).toEqual(['Second', 'A Space']);
  });
});
