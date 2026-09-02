import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  SKELETON_LANES,
  ensureSkeletonLanes,
  saveTextBlockWithPromotion,
  fileLineInLane,
  createTensionPair,
  getSkeletonSnapshot,
} from '../skeleton.js';
import { createSpace } from '../spaces.js';
import { createBlock, listBlocksForSpace } from '../blocks.js';
import { listTrailEntries } from '../trail.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

// migrateTextBlockLines has no worker-side equivalent to test -- see
// spaces.js/CLAUDE.md's note: a D1 database starts fresh on the current
// {lines} content shape, so there's never a legacy {tag, text} row to
// migrate here.

describe('ensureSkeletonLanes', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('creates all four lanes plus the Current Best Articulation block', async () => {
    await ensureSkeletonLanes(env, space.id);
    const blocks = await listBlocksForSpace(env, space.id);
    const lanes = blocks.filter((b) => b.type === 'list');
    expect(lanes.map((b) => b.properties.skeletonLane).sort()).toEqual(
      SKELETON_LANES.map((l) => l.key).sort()
    );
    expect(blocks.some((b) => b.properties.skeletonRole === 'current-best-articulation')).toBe(true);
  });

  it('is idempotent: calling it twice does not duplicate anything', async () => {
    await ensureSkeletonLanes(env, space.id);
    await ensureSkeletonLanes(env, space.id);
    expect(await listBlocksForSpace(env, space.id)).toHaveLength(5); // 4 lanes + articulation
  });
});

describe('saveTextBlockWithPromotion', () => {
  let space;
  let block;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
    block = await createBlock(env, { spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }] } });
  });

  it('promotes a "=" line into the Premises lane and removes it from the Text block', async () => {
    const updated = await saveTextBlockWithPromotion(env, block.id, [{ id: '1', text: '= a real premise', tag: null }]);
    expect(updated.content.lines).toEqual([]);

    const blocks = await listBlocksForSpace(env, space.id);
    const premisesLane = blocks.find((b) => b.properties.skeletonLane === 'premises');
    expect(premisesLane.content.items).toHaveLength(1);
    expect(premisesLane.content.items[0]).toMatchObject({ text: 'a real premise', confidence: 'tentative' });
  });

  it('promotes "?" to Open Questions and "!" to Tensions', async () => {
    await saveTextBlockWithPromotion(env, block.id, [
      { id: '1', text: '? is this reversible', tag: null },
      { id: '2', text: '! conflicting requirements', tag: null },
    ]);
    const lanes = await listBlocksForSpace(env, space.id);
    const questions = lanes.find((b) => b.properties.skeletonLane === 'open-questions');
    const tensions = lanes.find((b) => b.properties.skeletonLane === 'tensions');
    expect(questions.content.items[0].text).toBe('is this reversible');
    expect(tensions.content.items[0].text).toBe('conflicting requirements');
  });

  it('keeps an ordinary line as prose, untouched', async () => {
    const updated = await saveTextBlockWithPromotion(env, block.id, [{ id: '1', text: 'just a normal sentence', tag: 'reflection' }]);
    expect(updated.content.lines).toEqual([{ id: '1', text: 'just a normal sentence', tag: 'reflection' }]);
  });

  it('does not treat a bare trigger character with nothing after it as a promotion', async () => {
    const updated = await saveTextBlockWithPromotion(env, block.id, [{ id: '1', text: '=', tag: null }]);
    expect(updated.content.lines).toEqual([{ id: '1', text: '=', tag: null }]);
  });

  it('logs an auto Trail entry summarizing what was promoted', async () => {
    await saveTextBlockWithPromotion(env, block.id, [
      { id: '1', text: '= first premise', tag: null },
      { id: '2', text: '= second premise', tag: null },
    ]);
    const [entry] = await listTrailEntries(env, space.id);
    expect(entry.kind).toBe('auto');
    expect(entry.summary).toBe('Promoted: 2 Premises');
  });

  it('logs an auto Trail entry when the Current Best Articulation text actually changes', async () => {
    const articulation = await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'a', text: 'old text', tag: null }] },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    await saveTextBlockWithPromotion(env, articulation.id, [{ id: 'a', text: 'new text', tag: null }]);
    const entries = await listTrailEntries(env, space.id);
    expect(entries.map((e) => e.summary)).toContain('Updated Current Best Articulation');
  });

  it('does not log anything when an ordinary Text block\'s content does not change shape-affectingly', async () => {
    await saveTextBlockWithPromotion(env, block.id, [{ id: '1', text: 'no shorthand here', tag: null }]);
    expect(await listTrailEntries(env, space.id)).toEqual([]);
  });
});

describe('fileLineInLane', () => {
  it('copies a line into a lane without touching the original block, and logs Trail', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await fileLineInLane(env, space.id, 'evidence', 'some evidence text');
    const blocks = await listBlocksForSpace(env, space.id);
    const lane = blocks.find((b) => b.properties.skeletonLane === 'evidence');
    expect(lane.content.items[0].text).toBe('some evidence text');
    const [entry] = await listTrailEntries(env, space.id);
    expect(entry.summary).toBe('Filed into Evidence');
  });
});

describe('createTensionPair', () => {
  it('creates a Tensions-lane item carrying both statement pointers', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    const statementA = { blockId: 'block-1', itemId: 'item-1' };
    const statementB = { blockId: 'block-2', itemId: null };
    await createTensionPair(env, space.id, { label: 'Cost vs. speed', statementA, statementB });

    const blocks = await listBlocksForSpace(env, space.id);
    const tensions = blocks.find((b) => b.properties.skeletonLane === 'tensions');
    expect(tensions.content.items[0]).toMatchObject({ text: 'Cost vs. speed', statementA, statementB });
  });
});

describe('getSkeletonSnapshot', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('returns empty lanes and empty articulation for a Space with no Skeleton yet', async () => {
    const snapshot = await getSkeletonSnapshot(env, space.id);
    expect(Object.keys(snapshot.lanes).sort()).toEqual(SKELETON_LANES.map((l) => l.key).sort());
    Object.values(snapshot.lanes).forEach((lane) => expect(lane.items).toEqual([]));
    expect(snapshot.articulation).toBe('');
  });

  it('reads each lane\'s current label and items', async () => {
    await ensureSkeletonLanes(env, space.id);
    await fileLineInLane(env, space.id, 'premises', 'a premise');
    const snapshot = await getSkeletonSnapshot(env, space.id);
    expect(snapshot.lanes.premises.label).toBe('Premises');
    expect(snapshot.lanes.premises.items[0].text).toBe('a premise');
  });

  it('reads the Current Best Articulation text back out of its {lines} content', async () => {
    // Regression test (see the matching backend test): getSkeletonSnapshot
    // used to read articulationBlock.content.text directly, a field that
    // stopped existing once Text blocks moved to {lines}. createBlock
    // normalizes the {tag, text} shape below into {lines} immediately.
    const articulation = await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { tag: null, text: 'Line one\nLine two' },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    expect(articulation.content.text).toBeUndefined(); // sanity: confirms the shape that broke this

    const snapshot = await getSkeletonSnapshot(env, space.id);
    expect(snapshot.articulation).toBe('Line one\nLine two');
  });

  it('handles an articulation block whose lines are empty', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'a', text: '', tag: null }] },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    expect((await getSkeletonSnapshot(env, space.id)).articulation).toBe('');
  });
});
