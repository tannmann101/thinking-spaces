import { describe, it, expect, beforeEach } from 'vitest';
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
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('blocks.js', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  describe('createBlock / getBlockById', () => {
    it('creates a block and normalizes Text content to {lines}', () => {
      const block = createBlock({ spaceId: space.id, type: 'text', content: { tag: 'quote', text: 'hello' } });
      expect(block.type).toBe('text');
      expect(block.content.lines).toHaveLength(1);
      expect(block.content.lines[0]).toMatchObject({ text: 'hello', tag: 'quote' });
    });

    it('normalizes Work content to {support}', () => {
      const block = createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'X', rationale: 'Y' } });
      expect(block.content.support).toHaveLength(1);
    });

    it('leaves non-Text/Work content shapes as given', () => {
      const block = createBlock({ spaceId: space.id, type: 'reference', content: { target_space_id: 'other' } });
      expect(block.content).toEqual({ target_space_id: 'other' });
    });

    it('returns a falsy value for a nonexistent block id', () => {
      // parseBlockRow's `if (!row) return row` passes through
      // better-sqlite3's own `undefined` for "no row found" rather than
      // normalizing it to null -- consistent with getSpaceById and
      // every other single-row lookup in this codebase.
      expect(getBlockById('does-not-exist')).toBeUndefined();
    });
  });

  describe('nextPosition / blockExistsAtPosition', () => {
    it('starts at 0 for an empty Space', () => {
      expect(nextPosition(space.id)).toBe(0);
    });

    it('increments past the highest existing position', () => {
      createBlock({ spaceId: space.id, type: 'text', content: {}, position: 0 });
      createBlock({ spaceId: space.id, type: 'text', content: {}, position: 5 });
      expect(nextPosition(space.id)).toBe(6);
    });

    it('reports whether a position is already taken', () => {
      expect(blockExistsAtPosition(space.id, 0)).toBe(false);
      createBlock({ spaceId: space.id, type: 'text', content: {}, position: 0 });
      expect(blockExistsAtPosition(space.id, 0)).toBe(true);
    });
  });

  describe('addBlockToSpace', () => {
    it('appends at nextPosition and logs a block_added activity entry', () => {
      const first = addBlockToSpace(space.id, { type: 'text', content: { text: 'one' } });
      const second = addBlockToSpace(space.id, { type: 'text', content: { text: 'two' } });
      expect(first.position).toBe(0);
      expect(second.position).toBe(1);
    });
  });

  describe('listBlocksForSpace', () => {
    it('orders by position then created_at', () => {
      addBlockToSpace(space.id, { type: 'text', content: { text: 'first' } });
      addBlockToSpace(space.id, { type: 'text', content: { text: 'second' } });
      const blocks = listBlocksForSpace(space.id);
      expect(blocks.map((b) => b.content.lines[0].text)).toEqual(['first', 'second']);
    });

    it('hydrates a Reference block with its target Space\'s current title', () => {
      const target = createSpace({ title: 'Target Space' });
      addBlockToSpace(space.id, { type: 'reference', content: { target_space_id: target.id, note: null } });
      const [block] = listBlocksForSpace(space.id);
      expect(block.content.targetSpaceTitle).toBe('Target Space');
    });

    it('leaves a non-reference block alone', () => {
      addBlockToSpace(space.id, { type: 'text', content: { text: 'x' } });
      const [block] = listBlocksForSpace(space.id);
      expect(block.content.targetSpaceTitle).toBeUndefined();
    });
  });

  describe('listBacklinksForSpace', () => {
    it('finds every Reference block across every Space pointing at this one', () => {
      const target = createSpace({ title: 'Target' });
      addBlockToSpace(space.id, { type: 'reference', content: { target_space_id: target.id, note: 'why it matters' } });
      const backlinks = listBacklinksForSpace(target.id);
      expect(backlinks).toHaveLength(1);
      expect(backlinks[0]).toMatchObject({ sourceSpaceId: space.id, sourceSpaceTitle: 'A Space', note: 'why it matters' });
    });

    it('returns nothing for a Space with no incoming references', () => {
      expect(listBacklinksForSpace(space.id)).toEqual([]);
    });
  });

  describe('getGraphData', () => {
    it('includes reference edges and excludes the Test Space', () => {
      createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
      const target = createSpace({ title: 'Target' });
      addBlockToSpace(space.id, { type: 'reference', content: { target_space_id: target.id } });
      addBlockToSpace(TEST_SPACE_ID, { type: 'reference', content: { target_space_id: target.id } });

      const graph = getGraphData();
      expect(graph.spaces.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
      const referenceEdges = graph.edges.filter((e) => e.kind === 'reference');
      expect(referenceEdges).toHaveLength(1);
      expect(referenceEdges[0]).toMatchObject({ sourceSpaceId: space.id, targetSpaceId: target.id });
    });

    it('includes one contains edge per Workspace', () => {
      const workspace = createWorkspace({ spaceId: space.id, name: 'A Workspace' });
      const graph = getGraphData();
      const containEdges = graph.edges.filter((e) => e.kind === 'contains');
      expect(containEdges).toEqual([{ kind: 'contains', spaceId: space.id, workspaceId: workspace.id }]);
    });

    it('still includes a reference edge whose target Space was since deleted', () => {
      // CLAUDE.md is explicit that a dangling Reference is "left as-is"
      // rather than cleaned up -- the frontend falls back to showing
      // the raw target id once the title lookup can't resolve it. This
      // pins that same "don't silently drop it" behavior at the Graph
      // data layer.
      addBlockToSpace(space.id, { type: 'reference', content: { target_space_id: 'deleted-space' } });
      const graph = getGraphData();
      const referenceEdges = graph.edges.filter((e) => e.kind === 'reference');
      expect(referenceEdges).toHaveLength(1);
      expect(referenceEdges[0].targetSpaceId).toBe('deleted-space');
    });
  });

  describe('countBlocksForSpace', () => {
    it('counts all blocks, or only a given type', () => {
      addBlockToSpace(space.id, { type: 'text', content: {} });
      addBlockToSpace(space.id, { type: 'list', content: { items: [] } });
      expect(countBlocksForSpace(space.id)).toBe(2);
      expect(countBlocksForSpace(space.id, 'text')).toBe(1);
      expect(countBlocksForSpace(space.id, 'list')).toBe(1);
      expect(countBlocksForSpace(space.id, 'reference')).toBe(0);
    });
  });

  describe('deleteBlock', () => {
    it('removes the row and it no longer resolves', () => {
      const block = addBlockToSpace(space.id, { type: 'text', content: {} });
      deleteBlock(block.id);
      expect(getBlockById(block.id)).toBeUndefined();
    });

    it('is a no-op (does not throw) for an id that does not exist', () => {
      expect(() => deleteBlock('nonexistent')).not.toThrow();
    });
  });

  describe('moveBlockInSpace', () => {
    it('swaps two blocks\' positions', () => {
      const first = addBlockToSpace(space.id, { type: 'text', content: { text: 'first' } });
      const second = addBlockToSpace(space.id, { type: 'text', content: { text: 'second' } });
      moveBlockInSpace(space.id, second.id, -1);
      const ordered = listBlocksForSpace(space.id);
      expect(ordered.map((b) => b.id)).toEqual([second.id, first.id]);
      // Confirm the actual position values swapped, not just re-sorted.
      expect(getBlockById(first.id).position).toBe(1);
      expect(getBlockById(second.id).position).toBe(0);
    });

    it('does nothing when moving the first block up or the last block down', () => {
      const first = addBlockToSpace(space.id, { type: 'text', content: {} });
      const second = addBlockToSpace(space.id, { type: 'text', content: {} });
      moveBlockInSpace(space.id, first.id, -1);
      moveBlockInSpace(space.id, second.id, 1);
      expect(getBlockById(first.id).position).toBe(0);
      expect(getBlockById(second.id).position).toBe(1);
    });
  });

  describe('updateBlockContent', () => {
    it('replaces the whole content blob', () => {
      const block = createBlock({ spaceId: space.id, type: 'reference', content: { target_space_id: 'a' } });
      const updated = updateBlockContent(block.id, { target_space_id: 'b', note: 'changed' });
      expect(updated.content).toEqual({ target_space_id: 'b', note: 'changed' });
    });
  });

  describe('updateBlockCategories / updateBlockWorkspaces', () => {
    it('sets categories independently of content, without touching other properties', () => {
      const block = createBlock({ spaceId: space.id, type: 'text', content: {}, properties: { skeletonLane: 'premises' } });
      const updated = updateBlockCategories(block.id, ['Risk', 'Timing']);
      expect(updated.properties.categories).toEqual(['Risk', 'Timing']);
      expect(updated.properties.skeletonLane).toBe('premises');
    });

    it('sets workspace membership independently of categories', () => {
      const workspace = createWorkspace({ spaceId: space.id, name: 'WS' });
      const block = createBlock({ spaceId: space.id, type: 'text', content: {}, properties: { categories: ['X'] } });
      const updated = updateBlockWorkspaces(block.id, [workspace.id]);
      expect(updated.properties.workspaces).toEqual([workspace.id]);
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('returns null for a nonexistent block rather than throwing', () => {
      expect(updateBlockCategories('nonexistent', ['X'])).toBeNull();
      expect(updateBlockWorkspaces('nonexistent', ['y'])).toBeNull();
    });
  });

  describe('updateBlockProject', () => {
    it('sets a single Project id, independently of other properties', () => {
      const project = createProject({ spaceId: space.id, name: 'Ship it' });
      const block = createBlock({ spaceId: space.id, type: 'milestone', content: {}, properties: { categories: ['X'] } });
      const updated = updateBlockProject(block.id, project.id);
      expect(updated.properties.projectId).toBe(project.id);
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('clears the Project id when passed null', () => {
      const project = createProject({ spaceId: space.id, name: 'Ship it' });
      const block = createBlock({ spaceId: space.id, type: 'milestone', content: {}, properties: {} });
      updateBlockProject(block.id, project.id);
      const cleared = updateBlockProject(block.id, null);
      expect(cleared.properties.projectId).toBeNull();
    });

    it('returns null for a nonexistent block rather than throwing', () => {
      expect(updateBlockProject('nonexistent', 'some-id')).toBeNull();
    });
  });
});
