import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  SKELETON_LANES,
  ensureSkeletonLanes,
  saveTextBlockWithPromotion,
  migrateTextBlockLines,
  fileLineInLane,
  createTensionPair,
  getSkeletonSnapshot,
  listAllSkeletonClaims,
} from '../skeleton.js';
import { createSpace } from '../spaces.js';
import { createBlock, listBlocksForSpace, updateBlockContent } from '../blocks.js';
import { listTrailEntries } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('ensureSkeletonLanes', () => {
  let space;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('creates all four lanes plus the Current Best Articulation block', () => {
    ensureSkeletonLanes(space.id);
    const blocks = listBlocksForSpace(space.id);
    const lanes = blocks.filter((b) => b.type === 'list');
    expect(lanes.map((b) => b.properties.skeletonLane).sort()).toEqual(
      SKELETON_LANES.map((l) => l.key).sort()
    );
    expect(blocks.some((b) => b.properties.skeletonRole === 'current-best-articulation')).toBe(true);
  });

  it('is idempotent: calling it twice does not duplicate anything', () => {
    ensureSkeletonLanes(space.id);
    ensureSkeletonLanes(space.id);
    expect(listBlocksForSpace(space.id)).toHaveLength(5); // 4 lanes + articulation
  });
});

describe('saveTextBlockWithPromotion', () => {
  let space;
  let block;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
    block = createBlock({ spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }] } });
  });

  it('promotes a "=" line into the Premises lane and removes it from the Text block', () => {
    const updated = saveTextBlockWithPromotion(block.id, [{ id: '1', text: '= a real premise', tag: null }]);
    expect(updated.content.lines).toEqual([]);

    const premisesLane = listBlocksForSpace(space.id).find((b) => b.properties.skeletonLane === 'premises');
    expect(premisesLane.content.items).toHaveLength(1);
    expect(premisesLane.content.items[0]).toMatchObject({ text: 'a real premise', confidence: 'tentative' });
  });

  it('promotes "?" to Open Questions and "!" to Tensions', () => {
    saveTextBlockWithPromotion(block.id, [
      { id: '1', text: '? is this reversible', tag: null },
      { id: '2', text: '! conflicting requirements', tag: null },
    ]);
    const lanes = listBlocksForSpace(space.id);
    const questions = lanes.find((b) => b.properties.skeletonLane === 'open-questions');
    const tensions = lanes.find((b) => b.properties.skeletonLane === 'tensions');
    expect(questions.content.items[0].text).toBe('is this reversible');
    expect(tensions.content.items[0].text).toBe('conflicting requirements');
  });

  it('keeps an ordinary line as prose, untouched', () => {
    const updated = saveTextBlockWithPromotion(block.id, [{ id: '1', text: 'just a normal sentence', tag: 'reflection' }]);
    expect(updated.content.lines).toEqual([{ id: '1', text: 'just a normal sentence', tag: 'reflection' }]);
  });

  it('does not treat a bare trigger character with nothing after it as a promotion', () => {
    const updated = saveTextBlockWithPromotion(block.id, [{ id: '1', text: '=', tag: null }]);
    expect(updated.content.lines).toEqual([{ id: '1', text: '=', tag: null }]);
  });

  it('logs an auto Trail entry summarizing what was promoted, and attaches the same text as changeSummary', () => {
    const updated = saveTextBlockWithPromotion(block.id, [
      { id: '1', text: '= first premise', tag: null },
      { id: '2', text: '= second premise', tag: null },
    ]);
    const [entry] = listTrailEntries(space.id);
    expect(entry.kind).toBe('auto');
    expect(entry.summary).toBe('Promoted: 2 Premises');
    expect(updated.changeSummary).toBe('Promoted: 2 Premises');
  });

  it('logs an auto Trail entry when the Current Best Articulation text actually changes', () => {
    const articulation = createBlock({
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'a', text: 'old text', tag: null }] },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    const updated = saveTextBlockWithPromotion(articulation.id, [{ id: 'a', text: 'new text', tag: null }]);
    const entries = listTrailEntries(space.id);
    expect(entries.map((e) => e.summary)).toContain('Updated Current Best Articulation');
    expect(updated.changeSummary).toBe('Updated Current Best Articulation');
  });

  it('does not log anything when an ordinary Text block\'s content does not change shape-affectingly', () => {
    const updated = saveTextBlockWithPromotion(block.id, [{ id: '1', text: 'no shorthand here', tag: null }]);
    expect(listTrailEntries(space.id)).toEqual([]);
    expect(updated.changeSummary).toBeUndefined();
  });
});

describe('migrateTextBlockLines', () => {
  beforeEach(() => {
    resetDb();
  });

  it('upgrades a legacy {tag, text} Text block to {lines} in place', () => {
    const space = createSpace({ title: 'Migration' });
    db.prepare(`INSERT INTO blocks (id, space_id, type, content, properties, position) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'legacy-text',
      space.id,
      'text',
      JSON.stringify({ tag: 'quote', text: 'old shape\nsecond line' }),
      '{}',
      0
    );
    migrateTextBlockLines();
    const row = db.prepare('SELECT content FROM blocks WHERE id = ?').get('legacy-text');
    const content = JSON.parse(row.content);
    expect(content.lines).toHaveLength(2);
    expect(content.lines.map((l) => l.text)).toEqual(['old shape', 'second line']);
  });

  it('leaves an already-migrated block untouched', () => {
    const space = createSpace({ title: 'Already migrated' });
    const block = createBlock({ spaceId: space.id, type: 'text', content: { lines: [{ id: 'a', text: 'x', tag: null }] } });
    migrateTextBlockLines();
    const row = db.prepare('SELECT content FROM blocks WHERE id = ?').get(block.id);
    expect(JSON.parse(row.content).lines[0].id).toBe('a');
  });
});

describe('fileLineInLane', () => {
  it('copies a line into a lane without touching the original block, and logs Trail', () => {
    const space = createSpace({ title: 'A Space' });
    const result = fileLineInLane(space.id, 'evidence', 'some evidence text');
    const lane = listBlocksForSpace(space.id).find((b) => b.properties.skeletonLane === 'evidence');
    expect(lane.content.items[0].text).toBe('some evidence text');
    const [entry] = listTrailEntries(space.id);
    expect(entry.summary).toBe('Filed into Evidence');
    expect(result.changeSummary).toBe('Filed into Evidence');
  });
});

describe('createTensionPair', () => {
  it('creates a Tensions-lane item carrying both statement pointers', () => {
    const space = createSpace({ title: 'A Space' });
    const statementA = { blockId: 'block-1', itemId: 'item-1' };
    const statementB = { blockId: 'block-2', itemId: null };
    createTensionPair(space.id, { label: 'Cost vs. speed', statementA, statementB });

    const tensions = listBlocksForSpace(space.id).find((b) => b.properties.skeletonLane === 'tensions');
    expect(tensions.content.items[0]).toMatchObject({ text: 'Cost vs. speed', statementA, statementB });
  });

  it('attaches an implication-bearing changeSummary, for the toast (see Toast.jsx)', () => {
    const space = createSpace({ title: 'A Space' });
    const result = createTensionPair(space.id, {
      label: 'Cost vs. speed',
      statementA: { blockId: 'b1', itemId: null },
      statementB: { blockId: 'b2', itemId: null },
    });
    expect(result.changeSummary).toBe('Tension paired: "Cost vs. speed" -- now counted as an open Tension in Insights');
  });
});

describe('getSkeletonSnapshot', () => {
  let space;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('returns empty lanes and empty articulation for a Space with no Skeleton yet', () => {
    const snapshot = getSkeletonSnapshot(space.id);
    expect(Object.keys(snapshot.lanes).sort()).toEqual(SKELETON_LANES.map((l) => l.key).sort());
    Object.values(snapshot.lanes).forEach((lane) => expect(lane.items).toEqual([]));
    expect(snapshot.articulation).toBe('');
  });

  it('reads each lane\'s current label and items', () => {
    ensureSkeletonLanes(space.id);
    fileLineInLane(space.id, 'premises', 'a premise');
    const snapshot = getSkeletonSnapshot(space.id);
    expect(snapshot.lanes.premises.label).toBe('Premises');
    expect(snapshot.lanes.premises.items[0].text).toBe('a premise');
  });

  it('reads the Current Best Articulation text back out of its {lines} content', () => {
    // Regression test: getSkeletonSnapshot used to read
    // articulationBlock.content.text directly, a field that stopped
    // existing the moment Text blocks were migrated to {lines} -- every
    // Trail snapshot (auto/manual/review) silently recorded an empty
    // articulation from that point on, no matter what was actually
    // written. Confirmed live before fixing: createBlock normalizes the
    // {tag, text} shape below into {lines} immediately.
    const articulation = createBlock({
      spaceId: space.id,
      type: 'text',
      content: { tag: null, text: 'Line one\nLine two' },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    expect(articulation.content.text).toBeUndefined(); // sanity: confirms the shape that broke this

    const snapshot = getSkeletonSnapshot(space.id);
    expect(snapshot.articulation).toBe('Line one\nLine two');
  });

  it('handles an articulation block whose lines are empty', () => {
    createBlock({
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'a', text: '', tag: null }] },
      properties: { skeletonRole: 'current-best-articulation' },
    });
    expect(getSkeletonSnapshot(space.id).articulation).toBe('');
  });
});

describe('listAllSkeletonClaims', () => {
  beforeEach(() => {
    resetDb();
  });

  it('lists items from every claim-bearing lane, across every Space', () => {
    const spaceA = createSpace({ title: 'Space A' });
    fileLineInLane(spaceA.id, 'premises', 'a premise');
    const spaceB = createSpace({ title: 'Space B' });
    fileLineInLane(spaceB.id, 'evidence', 'a piece of evidence');

    const claims = listAllSkeletonClaims();
    expect(claims.map((c) => c.text).sort()).toEqual(['a piece of evidence', 'a premise']);
    const fromA = claims.find((c) => c.text === 'a premise');
    expect(fromA).toMatchObject({ spaceId: spaceA.id, spaceTitle: 'Space A', laneLabel: 'Premises' });
  });

  it('excludes the Tensions lane -- a Tension is not itself a linkable claim', () => {
    const space = createSpace({ title: 'Has a Tension' });
    createBlock({
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Cost vs. speed' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    expect(listAllSkeletonClaims()).toEqual([]);
  });

  it('excludes the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    fileLineInLane(TEST_SPACE_ID, 'premises', 'scratch');
    expect(listAllSkeletonClaims()).toEqual([]);
  });
});
