import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { getReviewDraft, createReview } from '../review.js';
import { createSpace } from '../spaces.js';
import { createBlock, addBlockToSpace } from '../blocks.js';
import { logTrailEntry } from '../trail.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('getReviewDraft', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns null for a nonexistent Space', () => {
    expect(getReviewDraft('nonexistent')).toBeNull();
  });

  it('is the first review when no review Trail entry exists yet', () => {
    const space = createSpace({ title: 'Fresh' });
    expect(getReviewDraft(space.id).isFirstReview).toBe(true);
  });

  it('is not the first review once one has been logged', () => {
    const space = createSpace({ title: 'Reviewed once' });
    createReview(space.id);
    expect(getReviewDraft(space.id).isFirstReview).toBe(false);
  });

  it('reports "nothing new" when nothing has changed since the reference point', () => {
    const space = createSpace({ title: 'Untouched' });
    // Force sinceDate strictly earlier than "now" so this isn't
    // sensitive to the same-second boundary case exercised below.
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    const draft = getReviewDraft(space.id);
    expect(draft.summaryText).toBe('Review: nothing new since last review');
    expect(draft.totalBlocksAdded).toBe(0);
  });

  it('counts blocks added since the reference point and names their types', () => {
    const space = createSpace({ title: 'Has new blocks' });
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    createBlock({ spaceId: space.id, type: 'text', content: {} });
    createBlock({ spaceId: space.id, type: 'text', content: {} });
    createBlock({ spaceId: space.id, type: 'list', content: { items: [] } });

    const draft = getReviewDraft(space.id);
    expect(draft.totalBlocksAdded).toBe(3);
    expect(draft.blocksAdded.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: 'list', count: 1 },
      { type: 'text', count: 2 },
    ]);
    expect(draft.summaryText).toBe('Review: 3 entries added');
  });

  it('counts a Space\'s own starter blocks (created in the same request as the Space itself) as new for its first Review', () => {
    // A Space's created_at and its first blocks' created_at can land in
    // the exact same SQLite datetime('now') second (second-granularity,
    // no fractional part) -- createSpaceWithSetup creates a Space and
    // then immediately adds every Template/extra block synchronously,
    // well within the same second in real usage. getReviewDraft's own
    // filter uses `>=` for exactly this reason -- this pins that a
    // same-second block still counts, not just a strictly-later one.
    const space = createSpace({ title: 'Just created' });
    addBlockToSpace(space.id, { type: 'text', content: { text: 'starter block' } });
    const draft = getReviewDraft(space.id);
    expect(draft.totalBlocksAdded).toBe(1);
  });

  it('counts a Milestone reached on/after the reference day', () => {
    const space = createSpace({ title: 'Has a milestone' });
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: '2020-01-01', reached: true, reachedAt: '2024-01-01', note: null },
    });
    const draft = getReviewDraft(space.id);
    expect(draft.milestonesReached).toEqual([{ label: 'Ship it', reachedAt: '2024-01-01' }]);
    expect(draft.summaryText).toContain('1 milestone reached');
  });

  it('does not count an unreached Milestone', () => {
    const space = createSpace({ title: 'Has an unreached milestone' });
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Not yet', targetDate: '2099-01-01', reached: false, reachedAt: null, note: null },
    });
    expect(getReviewDraft(space.id).milestonesReached).toEqual([]);
  });

  it('sums minutes across completed Sessions ended after the reference point', () => {
    const space = createSpace({ title: 'Has sessions' });
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    createBlock({
      spaceId: space.id,
      type: 'session',
      content: { label: 'Deep work', startedAt: '2024-06-01T10:00:00.000Z', endedAt: '2024-06-01T10:45:00.000Z', durationMinutes: 45, note: null },
    });
    const draft = getReviewDraft(space.id);
    expect(draft.totalMinutesLogged).toBe(45);
    expect(draft.summaryText).toContain('45 min logged');
  });

  it('does not count a Session that is still running (no endedAt)', () => {
    const space = createSpace({ title: 'Running session' });
    db.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(space.id);
    createBlock({
      spaceId: space.id,
      type: 'session',
      content: { label: 'In progress', startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null, note: null },
    });
    expect(getReviewDraft(space.id).sessionsCompleted).toEqual([]);
  });

  it('only counts changes since the most recent Review, not the Space\'s own creation', () => {
    // Every timestamp here is pinned explicitly and far apart, rather
    // than relying on real wall-clock ordering -- this test is about
    // "does the query pick the right reference point," not about
    // real-time behavior (that's what the same-second test above
    // covers).
    const space = createSpace({ title: 'Reviewed before' });
    const beforeBlock = createBlock({ spaceId: space.id, type: 'text', content: {} });
    db.prepare(`UPDATE blocks SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(beforeBlock.id);

    const review = logTrailEntry({ spaceId: space.id, kind: 'review', summary: 'first review' });
    db.prepare(`UPDATE trail_entries SET created_at = '2010-01-01 00:00:00' WHERE id = ?`).run(review.id);

    const afterBlock = createBlock({ spaceId: space.id, type: 'text', content: {} });
    db.prepare(`UPDATE blocks SET created_at = '2020-01-01 00:00:00' WHERE id = ?`).run(afterBlock.id);

    const draft = getReviewDraft(space.id);
    // Only the block added after the review counts, not the one from
    // before it.
    expect(draft.totalBlocksAdded).toBe(1);
  });
});

describe('createReview', () => {
  beforeEach(() => {
    resetDb();
  });

  it('writes a Trail entry whose summary exactly matches the draft\'s summaryText', () => {
    const space = createSpace({ title: 'A Space' });
    const draft = getReviewDraft(space.id);
    const entry = createReview(space.id);
    expect(entry.kind).toBe('review');
    expect(entry.summary).toBe(draft.summaryText);
  });

  it('returns null for a nonexistent Space', () => {
    expect(createReview('nonexistent')).toBeNull();
  });
});
