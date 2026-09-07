import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  listBlocksForSpace,
  listBacklinksForSpace,
  getBlockById,
  getBlockByIdWithSpaceTitle,
  countBlocksForSpace,
  blockExistsAtPosition,
  nextPosition,
  createBlock,
  addBlockToSpace,
  deleteBlock,
  reorderBlocksInSpace,
  moveBlockToSpace,
  updateBlockContent,
  updateBlockCategories,
  updateBlockWorkspaces,
  updateBlockTheme,
} from '../blocks.js';
import { createSpace } from '../spaces.js';
import { createWorkspace } from '../workspaces.js';
import { listSpaceHistory } from '../trail.js';
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

  describe('getBlockByIdWithSpaceTitle', () => {
    it('includes the parent Space\'s current title alongside the ordinary block fields', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { text: 'x' } });
      const result = await getBlockByIdWithSpaceTitle(env, block.id);
      expect(result.spaceTitle).toBe('A Space');
      expect(result.type).toBe('text');
    });

    it('returns null for a nonexistent block id', async () => {
      expect(await getBlockByIdWithSpaceTitle(env, 'does-not-exist')).toBeNull();
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

    it('attaches the same sentence as the changeSummary, for the toast (see Toast.jsx)', async () => {
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'x' } });
      expect(block.changeSummary).toBe(`Added a text entry to "${space.title}"`);
    });

    it('logs the new block\'s own id, so deep-linking can jump straight to it', async () => {
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'x' } });
      const logged = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'block_added'`).first();
      expect(logged.block_id).toBe(block.id);
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

  describe('moveBlockToSpace', () => {
    it('moves an entry, appending it at the end of the target Space', async () => {
      const other = await createSpace(env, { title: 'Somewhere Else' });
      await addBlockToSpace(env, other.id, { type: 'text', content: { text: 'already here' } });
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'travelling' } });

      const moved = await moveBlockToSpace(env, block.id, other.id);
      expect(moved.space_id).toBe(other.id);
      expect(moved.changeSummary).toContain('Somewhere Else');

      expect((await listBlocksForSpace(env, space.id)).map((b) => b.id)).not.toContain(block.id);
      const arrived = await listBlocksForSpace(env, other.id);
      expect(arrived.map((b) => b.id)).toEqual([arrived[0].id, block.id]);
    });

    it('clears the Space-scoped properties and keeps the ones that travel', async () => {
      const other = await createSpace(env, { title: 'Somewhere Else' });
      const workspace = await createWorkspace(env, { spaceId: space.id, name: 'A Workspace' });
      const block = await addBlockToSpace(env, space.id, { type: 'milestone', content: { label: 'Ship it' } });
      await updateBlockCategories(env, block.id, ['Risk']);
      await updateBlockWorkspaces(env, block.id, [workspace.id]);
      await updateBlockTheme(env, block.id, { accent: 'moss' });

      const moved = await moveBlockToSpace(env, block.id, other.id);
      // Categories name the source Space's own facets; Workspace ids
      // belong to the source Space. Neither means anything here.
      expect(moved.properties.categories).toBeUndefined();
      expect(moved.properties.workspaces).toBeUndefined();
      // A hand-picked look is the person's, not the Space's.
      expect(moved.properties.theme).toEqual({ accent: 'moss' });
    });

    it('refuses to move a Skeleton section out of its Space', async () => {
      const other = await createSpace(env, { title: 'Somewhere Else' });
      const lane = await addBlockToSpace(env, space.id, {
        type: 'list',
        content: { heading: 'Premises', items: [] },
        properties: { skeletonLane: 'premises' },
      });
      const result = await moveBlockToSpace(env, lane.id, other.id);
      expect(result.error).toMatch(/Skeleton/);
      expect((await getBlockById(env, lane.id)).space_id).toBe(space.id);
    });

    it('reports a missing entry, a missing target, and a no-op move', async () => {
      const other = await createSpace(env, { title: 'Somewhere Else' });
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'here' } });
      expect((await moveBlockToSpace(env, 'nope', other.id)).error).toBe('not found');
      expect((await moveBlockToSpace(env, block.id, 'nope')).error).toBe('target space not found');
      expect((await moveBlockToSpace(env, block.id, space.id)).error).toBe('already there');
    });

    it('records the move in both Spaces\' own histories', async () => {
      const other = await createSpace(env, { title: 'Somewhere Else' });
      const block = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'travelling' } });
      await moveBlockToSpace(env, block.id, other.id);

      const from = await listSpaceHistory(env, space.id);
      const to = await listSpaceHistory(env, other.id);
      expect(from.some((row) => /Moved a text entry out/.test(row.summary))).toBe(true);
      expect(to.some((row) => /Moved a text entry in/.test(row.summary))).toBe(true);
    });
  });

  describe('reorderBlocksInSpace', () => {
    it('assigns positions from the order it is given', async () => {
      const a = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'a' } });
      const b = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'b' } });
      const c = await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'c' } });

      // A drag of any distance, which a run of adjacent swaps couldn't
      // express in one go.
      await reorderBlocksInSpace(env, space.id, [c.id, a.id, b.id]);
      expect((await listBlocksForSpace(env, space.id)).map((x) => x.id)).toEqual([c.id, a.id, b.id]);
      expect((await getBlockById(env, c.id)).position).toBe(0);
      expect((await getBlockById(env, b.id)).position).toBe(2);
    });

    it('keeps an entry the caller left out, at the end', async () => {
      // A page that hasn't seen a just-added entry sends a stale list;
      // that must reorder what it knows about, not bury the rest.
      const a = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      const b = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      const unseen = await addBlockToSpace(env, space.id, { type: 'text', content: {} });

      await reorderBlocksInSpace(env, space.id, [b.id, a.id]);
      expect((await listBlocksForSpace(env, space.id)).map((x) => x.id)).toEqual([b.id, a.id, unseen.id]);
    });

    it('ignores ids that do not belong to this Space', async () => {
      const other = await createSpace(env, { title: 'Elsewhere' });
      const mine = await addBlockToSpace(env, space.id, { type: 'text', content: {} });
      const theirs = await addBlockToSpace(env, other.id, { type: 'text', content: {} });

      await reorderBlocksInSpace(env, space.id, [theirs.id, mine.id]);
      expect((await listBlocksForSpace(env, space.id)).map((x) => x.id)).toEqual([mine.id]);
      expect((await getBlockById(env, theirs.id)).space_id).toBe(other.id);
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

  describe('updateBlockTheme', () => {
    it('stores a theme override alongside other properties, not instead of them', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'assessment', content: {}, properties: { categories: ['X'] } });
      const updated = await updateBlockTheme(env, block.id, { accent: 'teal' });
      expect(updated.properties.theme).toEqual({ accent: 'teal' });
      expect(updated.properties.categories).toEqual(['X']);
    });

    it('clears the override when passed null, dropping the block back onto its type default', async () => {
      const block = await createBlock(env, { spaceId: space.id, type: 'assessment', content: {}, properties: {} });
      await updateBlockTheme(env, block.id, { accent: 'teal' });
      expect((await updateBlockTheme(env, block.id, null)).properties.theme).toBeNull();
    });

    it('returns null for a nonexistent block', async () => {
      expect(await updateBlockTheme(env, 'nonexistent', { accent: 'teal' })).toBeNull();
    });
  });

});

// Trail used to be empty on essentially every real Space -- see
// listSpaceHistory in ../trail.js.
describe('recording ordinary work', () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  async function activityRows() {
    const { results } = await env.DB.prepare(
      `SELECT kind, summary, event_count FROM activity_log ORDER BY rowid`
    ).all();
    return results;
  }

  it('records an ordinary content edit', async () => {
    const block = await addBlockToSpace(env, space.id, { type: 'text', content: { lines: [] } });
    await updateBlockContent(env, block.id, { lines: [{ id: '1', text: 'written', tag: null }] });

    const edits = (await activityRows()).filter((row) => row.kind === 'block_edited');
    expect(edits).toHaveLength(1);
    expect(edits[0].summary).toBe('Edited a text entry in "A Space"');
  });

  it('folds repeated edits to the same entry into one row', async () => {
    const block = await addBlockToSpace(env, space.id, { type: 'text', content: { lines: [] } });
    for (let i = 0; i < 5; i += 1) {
      await updateBlockContent(env, block.id, { lines: [{ id: '1', text: `draft ${i}`, tag: null }] });
    }

    const edits = (await activityRows()).filter((row) => row.kind === 'block_edited');
    expect(edits).toHaveLength(1);
    expect(edits[0].event_count).toBe(5);
  });

  it('gives a change with a real implication its own row, never coalesced', async () => {
    const block = await addBlockToSpace(env, space.id, {
      type: 'milestone',
      content: { label: 'Ship', reached: false },
    });
    await updateBlockContent(env, block.id, { label: 'Ship', reached: true, reachedAt: '2026-01-01' });

    const changed = (await activityRows()).filter((row) => row.kind === 'block_changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].summary).toContain('Milestone reached');
  });

  it('does not double-record an edit whose caller logs its own history', async () => {
    const block = await addBlockToSpace(env, space.id, { type: 'text', content: { lines: [] } });
    await updateBlockContent(env, block.id, { lines: [{ id: '1', text: 'quiet', tag: null }] }, { logEdit: false });

    expect((await activityRows()).filter((row) => row.kind === 'block_edited')).toHaveLength(0);
  });
});
