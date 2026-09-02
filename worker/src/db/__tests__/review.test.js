import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { getReviewDraft, createReview } from '../review.js';
import { createSpace } from '../spaces.js';
import { createBlock, addBlockToSpace } from '../blocks.js';
import { logTrailEntry } from '../trail.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('getReviewDraft', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('returns null for a nonexistent Space', async () => {
    expect(await getReviewDraft(env, 'nonexistent')).toBeNull();
  });

  it('is the first review when no review Trail entry exists yet', async () => {
    const space = await createSpace(env, { title: 'Fresh' });
    expect((await getReviewDraft(env, space.id)).isFirstReview).toBe(true);
  });

  it('is not the first review once one has been logged', async () => {
    const space = await createSpace(env, { title: 'Reviewed once' });
    await createReview(env, space.id);
    expect((await getReviewDraft(env, space.id)).isFirstReview).toBe(false);
  });

  it('reports "nothing new" when nothing has changed since the reference point', async () => {
    const space = await createSpace(env, { title: 'Untouched' });
    // Force sinceDate strictly earlier than "now" so this isn't
    // sensitive to the same-second boundary case exercised below.
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    const draft = await getReviewDraft(env, space.id);
    expect(draft.summaryText).toBe('Review: nothing new since last review');
    expect(draft.totalBlocksAdded).toBe(0);
  });

  it('counts blocks added since the reference point and names their types', async () => {
    const space = await createSpace(env, { title: 'Has new blocks' });
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await createBlock(env, { spaceId: space.id, type: 'list', content: { items: [] } });

    const draft = await getReviewDraft(env, space.id);
    expect(draft.totalBlocksAdded).toBe(3);
    expect(draft.blocksAdded.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: 'list', count: 1 },
      { type: 'text', count: 2 },
    ]);
    expect(draft.summaryText).toBe('Review: 3 entries added');
  });

  it('counts a Space\'s own starter blocks (created in the same request as the Space itself) as new for its first Review', async () => {
    // A Space's created_at and its first blocks' created_at can land in
    // the exact same D1 datetime('now') second (second-granularity, no
    // fractional part) -- createSpaceWithSetup creates a Space and then
    // immediately adds every Template/extra block synchronously, well
    // within the same second in real usage. getReviewDraft's own filter
    // uses `>=` for exactly this reason -- this pins that a same-second
    // block still counts, not just a strictly-later one.
    const space = await createSpace(env, { title: 'Just created' });
    await addBlockToSpace(env, space.id, { type: 'text', content: { text: 'starter block' } });
    const draft = await getReviewDraft(env, space.id);
    expect(draft.totalBlocksAdded).toBe(1);
  });

  it('counts a Milestone reached on/after the reference day', async () => {
    const space = await createSpace(env, { title: 'Has a milestone' });
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: '2020-01-01', reached: true, reachedAt: '2024-01-01', note: null },
    });
    const draft = await getReviewDraft(env, space.id);
    expect(draft.milestonesReached).toEqual([{ label: 'Ship it', reachedAt: '2024-01-01' }]);
    expect(draft.summaryText).toContain('1 milestone reached');
  });

  it('does not count an unreached Milestone', async () => {
    const space = await createSpace(env, { title: 'Has an unreached milestone' });
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Not yet', targetDate: '2099-01-01', reached: false, reachedAt: null, note: null },
    });
    expect((await getReviewDraft(env, space.id)).milestonesReached).toEqual([]);
  });

  it('sums minutes across completed Sessions ended after the reference point', async () => {
    const space = await createSpace(env, { title: 'Has sessions' });
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    await createBlock(env, {
      spaceId: space.id,
      type: 'session',
      content: { label: 'Deep work', startedAt: '2024-06-01T10:00:00.000Z', endedAt: '2024-06-01T10:45:00.000Z', durationMinutes: 45, note: null },
    });
    const draft = await getReviewDraft(env, space.id);
    expect(draft.totalMinutesLogged).toBe(45);
    expect(draft.summaryText).toContain('45 min logged');
  });

  it('does not count a Session that is still running (no endedAt)', async () => {
    const space = await createSpace(env, { title: 'Running session' });
    await env.DB.prepare(`UPDATE spaces SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(space.id).run();
    await createBlock(env, {
      spaceId: space.id,
      type: 'session',
      content: { label: 'In progress', startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null, note: null },
    });
    expect((await getReviewDraft(env, space.id)).sessionsCompleted).toEqual([]);
  });

  it('only counts changes since the most recent Review, not the Space\'s own creation', async () => {
    // Every timestamp here is pinned explicitly and far apart, rather
    // than relying on real wall-clock ordering -- this test is about
    // "does the query pick the right reference point," not about
    // real-time behavior (that's what the same-second test above
    // covers).
    const space = await createSpace(env, { title: 'Reviewed before' });
    const beforeBlock = await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await env.DB.prepare(`UPDATE blocks SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(beforeBlock.id).run();

    const review = await logTrailEntry(env, { spaceId: space.id, kind: 'review', summary: 'first review' });
    await env.DB.prepare(`UPDATE trail_entries SET created_at = '2010-01-01 00:00:00' WHERE id = ?`).bind(review.id).run();

    const afterBlock = await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await env.DB.prepare(`UPDATE blocks SET created_at = '2020-01-01 00:00:00' WHERE id = ?`).bind(afterBlock.id).run();

    const draft = await getReviewDraft(env, space.id);
    // Only the block added after the review counts, not the one from
    // before it.
    expect(draft.totalBlocksAdded).toBe(1);
  });
});

describe('createReview', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('writes a Trail entry whose summary exactly matches the draft\'s summaryText', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    const draft = await getReviewDraft(env, space.id);
    const entry = await createReview(env, space.id);
    expect(entry.kind).toBe('review');
    expect(entry.summary).toBe(draft.summaryText);
  });

  it('returns null for a nonexistent Space', async () => {
    expect(await createReview(env, 'nonexistent')).toBeNull();
  });
});
