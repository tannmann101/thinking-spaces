import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  listBlocksForSpace,
  listBacklinksForSpace,
  getGraphData,
  getBlockById,
  getBlockByIdWithSpaceTitle,
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
  updateBlockTheme,
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

  describe('getBlockByIdWithSpaceTitle', () => {
    it('includes the parent Space\'s current title alongside the ordinary block fields', () => {
      const block = createBlock({ spaceId: space.id, type: 'text', content: { text: 'x' } });
      const result = getBlockByIdWithSpaceTitle(block.id);
      expect(result.spaceTitle).toBe('A Space');
      expect(result.type).toBe('text');
    });

    it('returns a falsy value for a nonexistent block id', () => {
      expect(getBlockByIdWithSpaceTitle('does-not-exist')).toBeUndefined();
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

    it('attaches the same sentence as the changeSummary, for the toast (see Toast.jsx)', () => {
      const block = addBlockToSpace(space.id, { type: 'text', content: { text: 'x' } });
      expect(block.changeSummary).toBe(`Added a text entry to "${space.title}"`);
    });

    it('logs the new block\'s own id, so deep-linking can jump straight to it', () => {
      const block = addBlockToSpace(space.id, { type: 'text', content: { text: 'x' } });
      const logged = db.prepare(`SELECT * FROM activity_log WHERE kind = 'block_added'`).get();
      expect(logged.block_id).toBe(block.id);
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

    // A Project's place on the map is derived from where its member
    // entries live, so it only appears once something is assigned to it.
    it('includes one contains-project edge per Space a Project has work in', () => {
      const project = createProject({ name: 'A Project' });
      const block = addBlockToSpace(space.id, { type: 'milestone', content: {} });
      updateBlockProject(block.id, project.id);

      const graph = getGraphData();
      expect(graph.projects).toEqual([{ id: project.id, name: 'A Project', primary_space_id: space.id }]);
      const projectEdges = graph.edges.filter((e) => e.kind === 'contains-project');
      expect(projectEdges).toEqual([{ kind: 'contains-project', spaceId: space.id, projectId: project.id }]);
    });

    it('leaves a Project with no entries yet off the map entirely', () => {
      createProject({ name: 'Not started' });
      const graph = getGraphData();
      expect(graph.projects).toEqual([]);
      expect(graph.edges.filter((e) => e.kind === 'contains-project')).toEqual([]);
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

  describe('updateBlockTheme', () => {
    it('stores a theme override alongside other properties, not instead of them', () => {
      const block = createBlock({ spaceId: space.id, type: 'assessment', content: {}, properties: { categories: ['X'] } });
      const updated = updateBlockTheme(block.id, { accent: 'teal' });
      expect(updated.properties.theme).toEqual({ accent: 'teal' });
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('clears the override when passed null, dropping the block back onto its type default', () => {
      const block = createBlock({ spaceId: space.id, type: 'assessment', content: {}, properties: {} });
      updateBlockTheme(block.id, { accent: 'teal' });
      expect(updateBlockTheme(block.id, null).properties.theme).toBeNull();
    });

    it('returns null for a nonexistent block', () => {
      expect(updateBlockTheme('nonexistent', { accent: 'teal' })).toBeNull();
    });
  });

  describe('updateBlockProject', () => {
    it('sets a single Project id, independently of other properties', () => {
      const project = createProject({ name: 'Ship it' });
      const block = createBlock({ spaceId: space.id, type: 'milestone', content: {}, properties: { categories: ['X'] } });
      const updated = updateBlockProject(block.id, project.id);
      expect(updated.properties.projectId).toBe(project.id);
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('clears the Project id when passed null', () => {
      const project = createProject({ name: 'Ship it' });
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

// Trail used to be empty on essentially every real Space, because an
// auto entry only ever wrote itself on a Skeleton edit. These cover the
// two halves of the fix: that ordinary work is recorded at all, and
// that recording it doesn't flood the history.
describe('recording ordinary work', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  function activityRows() {
    return db.prepare(`SELECT kind, summary, event_count FROM activity_log ORDER BY rowid`).all();
  }

  it('records an ordinary content edit, which used to go unlogged entirely', () => {
    const block = addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    updateBlockContent(block.id, { lines: [{ id: '1', text: 'written', tag: null }] });

    const edits = activityRows().filter((row) => row.kind === 'block_edited');
    expect(edits).toHaveLength(1);
    expect(edits[0].summary).toBe('Edited a text entry in "A Space"');
    expect(edits[0].event_count).toBe(1);
  });

  it('folds repeated edits to the same entry into one row', () => {
    const block = addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    for (let i = 0; i < 5; i += 1) {
      updateBlockContent(block.id, { lines: [{ id: '1', text: `draft ${i}`, tag: null }] });
    }

    const edits = activityRows().filter((row) => row.kind === 'block_edited');
    expect(edits).toHaveLength(1);
    expect(edits[0].event_count).toBe(5);
  });

  it('keeps two different entries edited in the same window apart', () => {
    const a = addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    const b = addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    updateBlockContent(a.id, { lines: [{ id: '1', text: 'a', tag: null }] });
    updateBlockContent(b.id, { lines: [{ id: '1', text: 'b', tag: null }] });

    expect(activityRows().filter((row) => row.kind === 'block_edited')).toHaveLength(2);
  });

  it('gives a change with a real implication its own row, never coalesced', () => {
    const block = addBlockToSpace(space.id, { type: 'milestone', content: { label: 'Ship', reached: false } });
    updateBlockContent(block.id, { label: 'Ship', reached: true, reachedAt: '2026-01-01' });
    updateBlockContent(block.id, { label: 'Ship it', reached: true, reachedAt: '2026-01-01' });

    const rows = activityRows();
    const changed = rows.filter((row) => row.kind === 'block_changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].summary).toContain('Milestone reached');
    expect(changed[0].event_count).toBe(1);
    // The follow-up rename is an ordinary edit, so it lands separately.
    expect(rows.filter((row) => row.kind === 'block_edited')).toHaveLength(1);
  });

  it('records a Session completing', () => {
    const block = addBlockToSpace(space.id, {
      type: 'session',
      content: { label: 'Sitting', startedAt: '2026-01-01T10:00:00Z', endedAt: null },
    });
    updateBlockContent(block.id, {
      label: 'Sitting',
      startedAt: '2026-01-01T10:00:00Z',
      endedAt: '2026-01-01T10:42:00Z',
      durationMinutes: 42,
    });

    expect(activityRows().find((row) => row.kind === 'block_changed').summary).toContain('42 min logged');
  });

  it('leaves the Test Space out, same as every other kind of activity', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    const block = addBlockToSpace(TEST_SPACE_ID, { type: 'text', content: { lines: [] } });
    updateBlockContent(block.id, { lines: [{ id: '1', text: 'scratch', tag: null }] });

    expect(activityRows().filter((row) => row.kind === 'block_edited')).toHaveLength(0);
  });

  // Skeleton's own functions each write a Trail entry describing the
  // same change; recording it here too would report one action twice.
  it('does not double-record an edit whose caller logs its own history', () => {
    const block = addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    updateBlockContent(block.id, { lines: [{ id: '1', text: 'quiet', tag: null }] }, { logEdit: false });

    expect(activityRows().filter((row) => row.kind === 'block_edited')).toHaveLength(0);
  });
});
