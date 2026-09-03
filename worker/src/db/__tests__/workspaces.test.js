import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
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
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('workspaces.js', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('creates a Workspace scoped to its Space and logs activity', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Focused Work' });
    expect(workspace.name).toBe('Focused Work');
    expect(workspace.space_id).toBe(space.id);
    const { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'workspace_created'`).all();
    expect(results).toHaveLength(1);
  });

  it('lists only Workspaces belonging to the given Space', async () => {
    const other = await createSpace(env, { title: 'Other Space' });
    await createWorkspace(env, { spaceId: space.id, name: 'Mine' });
    await createWorkspace(env, { spaceId: other.id, name: 'Not mine' });
    const list = await listWorkspacesForSpace(env, space.id);
    expect(list.map((w) => w.name)).toEqual(['Mine']);
  });

  it('renames a Workspace in place', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Old name' });
    const updated = await updateWorkspace(env, workspace.id, { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect((await getWorkspaceById(env, workspace.id)).name).toBe('New name');
  });

  it('deleting a Workspace removes the row but leaves its blocks in place', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Doomed' });
    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await updateBlockWorkspaces(env, block.id, [workspace.id]);

    await deleteWorkspace(env, workspace.id);

    expect(await getWorkspaceById(env, workspace.id)).toBeNull();
    const survivingBlock = await env.DB.prepare('SELECT * FROM blocks WHERE id = ?').bind(block.id).first();
    expect(survivingBlock).toBeTruthy();
    // The block's own stale workspace id is left exactly as-is -- same
    // "graceful, do-nothing" handling a removed Category gets.
    expect(JSON.parse(survivingBlock.properties).workspaces).toEqual([workspace.id]);
  });

  it('deleting a nonexistent Workspace does not throw', async () => {
    await expect(deleteWorkspace(env, 'nonexistent')).resolves.not.toThrow();
  });

  it('stores a kind, so a Workspace can be a specialized environment', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Etymology', kind: 'etymology' });
    expect(workspace.kind).toBe('etymology');
    expect((await getWorkspaceById(env, workspace.id)).kind).toBe('etymology');
  });

  it('leaves kind null for a plain Workspace named by hand', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Plain' });
    expect(workspace.kind).toBeNull();
  });

  it('seeds starter blocks already joined to the new Workspace', async () => {
    const workspace = await createWorkspace(env, {
      spaceId: space.id,
      name: 'Analyst',
      kind: 'analyst',
      starterBlocks: [
        { type: 'text', content: { text: 'Observations' } },
        { type: 'analysis', content: { statement: 'Break it down', support: [], confidence: 'tentative' } },
      ],
    });

    const blocks = await listBlocksForSpace(env, space.id);
    const members = blocks.filter((block) => (block.properties?.workspaces || []).includes(workspace.id));
    expect(members).toHaveLength(2);
    expect(members.map((block) => block.type).sort()).toEqual(['analysis', 'text']);
  });

  it('gives each starter block its own position rather than stacking them all at one', async () => {
    await createWorkspace(env, {
      spaceId: space.id,
      name: 'Analyst',
      starterBlocks: [{ type: 'text', content: {} }, { type: 'text', content: {} }, { type: 'text', content: {} }],
    });
    const positions = (await listBlocksForSpace(env, space.id)).map((block) => block.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('lists every Workspace across every Space with its Space title and member count', async () => {
    const other = await createSpace(env, { title: 'Another Space' });
    const first = await createWorkspace(env, { spaceId: space.id, name: 'One', kind: 'analyst' });
    await createWorkspace(env, { spaceId: other.id, name: 'Two' });

    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: {}, position: 0 });
    await updateBlockWorkspaces(env, block.id, [first.id]);

    const all = await listAllWorkspaces(env);
    expect(all).toHaveLength(2);
    const one = all.find((workspace) => workspace.name === 'One');
    expect(one.space_title).toBe('A Space');
    expect(one.kind).toBe('analyst');
    expect(one.member_count).toBe(1);
    expect(all.find((workspace) => workspace.name === 'Two').member_count).toBe(0);
  });
});
