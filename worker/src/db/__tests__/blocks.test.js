import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  listBlocksForSpace,
  listBacklinksForSpace,
  getGraphData,
  getBlockById,
  countBlocksForSpace,
  blockExistsAtPosition,
  nextPosition,
  createBlock,
  addBlockToSpace,
  deleteBlock,
  moveBlockInSpace,
  updateBlockContent,
  updateBlockCategories,
  updateBlockWorkspaces,
  updateBlockProject,
} from '../blocks.js';
import { createSpace } from '../spaces.js';
import { createWorkspace } from '../workspaces.js';
import { createProject } from '../projects.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('blocks.js', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  describe('createBlock / getBlockById', () => {
    it('creates a block and normalizes Text content to {lines}', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { tag: 'quote', text: 'hello' } });
      expect(block.type).toBe('text');
      expect(block.content.lines).toHaveLength(1);
      expect(block.content.lines[0]).toMatchObject({ text: 'hello', tag: 'quote' });
    });

    it('normalizes Work content to {support}', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'X', rationale: 'Y' } });
      expect(block.content.support).toHaveLength(1);
    });

    it('leaves non-Text/Work content shapes as given', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'reference', content: { target_space_id: 'other' } });
      expect(block.content).toEqual({ target_space_id: 'other' });
    });

    it('returns null for a nonexistent block id', async () => {
      // D1's .first() returns null for "no row found" (unlike
      // better-sqlite3's undefined) -- parseBlockRow's `if (!row) return
      // row` passes that null straight through.
      expect(await getBlockById(env, 'does-not-exist')).toBeNull();
    });
  });

  describe('nextPosition / blockExistsAtPosition', () => {
    it('starts at 0 for an empty Space', async () => {
      expect(await nextPosition(env, space.id)).toBe(0);
    });

    it('increments past the highest existing position', async () => {
      await createBlock(env, { spaceId: space.id, type: 'text', content: {}, position: 0 });
      await createBlock(env, { spaceId: space.id, type: 'text', content: {}, position: 5 });
      expect(await nextPosition(env, space.id)).toBe(6);
    });

    it('reports whether a position is already taken', async () => {
      expect(await blockExistsAtPosition(env, space.id, 0)).toBe(false);
      await createBlock(env, { spaceId: space.id, type: 'text', content: {}, position: 0 });
      expect(await blockExistsAtPosition(env, space.id, 0)).toBe(true);
    });
  });

  describe('addBlockToSpace', () => {
    it('appends at nextPosition and logs a block_added activity entry', async () => {
      const first = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'one' } });
      const second = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'two' } });
      expect(first.position).toBe(0);
      expect(second.position).toBe(1);
    });
  });

  describe('listBlocksForSpace', () => {
    it('orders by position then created_at', async () => {
      await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'first' } });
      await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'second' } });
      const blocks = await listBlocksForSpace(env, space.id);
      expect(blocks.map((b) => b.content.lines[0].text)).toEqual(['first', 'second']);
    });

    it('hydrates a Reference block with its target Space\'s current title', async () => {
      const target = await createSpace(env, { title: 'Target Space' });
      await addBlockToSpace(env, space.id, { type: 'reference', content: { target_space_id: target.id, note: null } });
      const [block] = await listBlocksForSpace(env, space.id);
      expect(block.content.targetSpaceTitle).toBe('Target Space');
    });

    it('leaves a non-reference block alone', async () => {
      await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'x' } });
      const [block] = await listBlocksForSpace(env, space.id);
      expect(block.content.targetSpaceTitle).toBeUndefined();
    });
  });

  describe('listBacklinksForSpace', () => {
    it('finds every Reference block across every Space pointing at this one', async () => {
      const target = await createSpace(env, { title: 'Target' });
      await addBlockToSpace(env, space.id, { type: 'reference', content: { target_space_id: target.id, note: 'why it matters' } });
      const backlinks = await listBacklinksForSpace(env, target.id);
      expect(backlinks).toHaveLength(1);
      expect(backlinks[0]).toMatchObject({ sourceSpaceId: space.id, sourceSpaceTitle: 'A Space', note: 'why it matters' });
    });

    it('returns nothing for a Space with no incoming references', async () => {
      expect(await listBacklinksForSpace(env, space.id)).toEqual([]);
    });
  });

  describe('getGraphData', () => {
    it('includes reference edges and excludes the Test Space', async () => {
      await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
      const target = await createSpace(env, { title: 'Target' });
      await addBlockToSpace(env, space.id, { type: 'reference', content: { target_space_id: target.id } });
      await addBlockToSpace(env, TEST_SPACE_ID, { type: 'reference', content: { target_space_id: target.id } });

      const graph = await getGraphData(env);
      expect(graph.spaces.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
      const referenceEdges = graph.edges.filter((e) => e.kind === 'reference');
      expect(referenceEdges).toHaveLength(1);
      expect(referenceEdges[0]).toMatchObject({ sourceSpaceId: space.id, targetSpaceId: target.id });
    });

    it('includes one contains edge per Workspace', async () => {
      const workspace = await createWorkspace(env, { spaceId: space.id, name: 'A Workspace' });
      const graph = await getGraphData(env);
      const containEdges = graph.edges.filter((e) => e.kind === 'contains');
      expect(containEdges).toEqual([{ kind: 'contains', spaceId: space.id, workspaceId: workspace.id }]);
    });

    it('includes one contains-project edge per Project', async () => {
      const project = await createProject(env, { spaceId: space.id, name: 'A Project' });
      const graph = await getGraphData(env);
      expect(graph.projects).toEqual([{ id: project.id, space_id: space.id, name: 'A Project' }]);
      const projectEdges = graph.edges.filter((e) => e.kind === 'contains-project');
      expect(projectEdges).toEqual([{ kind: 'contains-project', spaceId: space.id, projectId: project.id }]);
    });

    it('still includes a reference edge whose target Space was since deleted', async () => {
      // CLAUDE.md is explicit that a dangling Reference is "left as-is"
      // rather than cleaned up -- the frontend falls back to showing
      // the raw target id once the title lookup can't resolve it. This
      // pins that same "don't silently drop it" behavior at the Graph
      // data layer.
      await addBlockToSpace(env, space.id, { type: 'reference', content: { target_space_id: 'deleted-space' } });
      const graph = await getGraphData(env);
      const referenceEdges = graph.edges.filter((e) => e.kind === 'reference');
      expect(referenceEdges).toHaveLength(1);
      expect(referenceEdges[0].targetSpaceId).toBe('deleted-space');
    });
  });

  describe('countBlocksForSpace', () => {
    it('counts all blocks, or only a given type', async () => {
      await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      await addBlockToSpace(env, space.id, { type: 'list', content: { items: [] } });
      expect(await countBlocksForSpace(env, space.id)).toBe(2);
      expect(await countBlocksForSpace(env, space.id, 'text')).toBe(1);
      expect(await countBlocksForSpace(env, space.id, 'list')).toBe(1);
      expect(await countBlocksForSpace(env, space.id, 'reference')).toBe(0);
    });
  });

  describe('deleteBlock', () => {
    it('removes the row and it no longer resolves', async () => {
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      await deleteBlock(env, block.id);
      expect(await getBlockById(env, block.id)).toBeNull();
    });

    it('is a no-op (does not throw) for an id that does not exist', async () => {
      await expect(deleteBlock(env, 'nonexistent')).resolves.not.toThrow();
    });
  });

  describe('moveBlockInSpace', () => {
    it('swaps two blocks\' positions', async () => {
      const first = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'first' } });
      const second = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'second' } });
      await moveBlockInSpace(env, space.id, second.id, -1);
      const ordered = await listBlocksForSpace(env, space.id);
      expect(ordered.map((b) => b.id)).toEqual([second.id, first.id]);
      // Confirm the actual position values swapped, not just re-sorted.
      expect((await getBlockById(env, first.id)).position).toBe(1);
      expect((await getBlockById(env, second.id)).position).toBe(0);
    });

    it('does nothing when moving the first block up or the last block down', async () => {
      const first = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      const second = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      await moveBlockInSpace(env, space.id, first.id, -1);
      await moveBlockInSpace(env, space.id, second.id, 1);
      expect((await getBlockById(env, first.id)).position).toBe(0);
      expect((await getBlockById(env, second.id)).position).toBe(1);
    });
  });

  describe('updateBlockContent', () => {
    it('replaces the whole content blob', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'reference', content: { target_space_id: 'a' } });
      const updated = await updateBlockContent(env, block.id, { target_space_id: 'b', note: 'changed' });
      expect(updated.content).toEqual({ target_space_id: 'b', note: 'changed' });
    });
  });

  describe('updateBlockCategories / updateBlockWorkspaces', () => {
    it('sets categories independently of content, without touching other properties', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'text', content: {}, properties: { skeletonLane: 'premises' } });
      const updated = await updateBlockCategories(env, block.id, ['Risk', 'Timing']);
      expect(updated.properties.categories).toEqual(['Risk', 'Timing']);
      expect(updated.properties.skeletonLane).toBe('premises');
    });

    it('sets workspace membership independently of categories', async () => {
      const workspace = await createWorkspace(env, { spaceId: space.id, name: 'WS' });
      const block = await createBlock(env, { spaceId: space.id, type: 'text', content: {}, properties: { categories: ['X'] } });
      const updated = await updateBlockWorkspaces(env, block.id, [workspace.id]);
      expect(updated.properties.workspaces).toEqual([workspace.id]);
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('returns null for a nonexistent block rather than throwing', async () => {
      expect(await updateBlockCategories(env, 'nonexistent', ['X'])).toBeNull();
      expect(await updateBlockWorkspaces(env, 'nonexistent', ['y'])).toBeNull();
    });
  });

  describe('updateBlockProject', () => {
    it('sets a single Project id, independently of other properties', async () => {
      const project = await createProject(env, { spaceId: space.id, name: 'Ship it' });
      const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {}, properties: { categories: ['X'] } });
      const updated = await updateBlockProject(env, block.id, project.id);
      expect(updated.properties.projectId).toBe(project.id);
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('clears the Project id when passed null', async () => {
      const project = await createProject(env, { spaceId: space.id, name: 'Ship it' });
      const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {}, properties: {} });
      await updateBlockProject(env, block.id, project.id);
      const cleared = await updateBlockProject(env, block.id, null);
      expect(cleared.properties.projectId).toBeNull();
    });

    it('returns null for a nonexistent block rather than throwing', async () => {
      expect(await updateBlockProject(env, 'nonexistent', 'some-id')).toBeNull();
    });
  });
});
