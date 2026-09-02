import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { getWorkMixInsights, getThemeInsights, getActivityTrendInsights, getProvenanceInsights, getTimeInsights } from '../insights.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('getWorkMixInsights', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('counts Work items by type and by confidence', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'a', confidence: 'solid' } });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'b', confidence: 'solid' } });
    await createBlock(env, { spaceId: space.id, type: 'question', content: { statement: 'c', confidence: 'questioned' } });

    const insights = await getWorkMixInsights(env);
    expect(insights.total).toBe(3);
    expect(insights.byType.find((t) => t.type === 'assessment').count).toBe(2);
    expect(insights.byType.find((t) => t.type === 'question').count).toBe(1);
    expect(insights.byConfidence.find((c) => c.level === 'solid').count).toBe(2);
    expect(insights.byConfidence.find((c) => c.level === 'questioned').count).toBe(1);
  });

  it('defaults a missing confidence to tentative', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await env.DB.prepare(`INSERT INTO blocks (id, space_id, type, content, properties, position) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind('no-confidence', space.id, 'assessment', JSON.stringify({ statement: 'x' }), '{}', 0)
      .run();
    const insights = await getWorkMixInsights(env);
    expect(insights.byConfidence.find((c) => c.level === 'tentative').count).toBe(1);
  });

  it('excludes non-Work blocks and the Test Space', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await createBlock(env, { spaceId: TEST_SPACE_ID, type: 'assessment', content: { statement: 'scratch' } });
    expect((await getWorkMixInsights(env)).total).toBe(0);
  });

  it('reading names the most common type and confidence, and the settled share', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'a', confidence: 'solid' } });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'b', confidence: 'solid' } });
    await createBlock(env, { spaceId: space.id, type: 'question', content: { statement: 'c', confidence: 'questioned' } });
    const insights = await getWorkMixInsights(env);
    expect(insights.reading).toContain('Assessment');
    expect(insights.reading).toContain('solid');
    expect(insights.reading).toContain('67%');
  });

  it('reading is null when there are no Work items', async () => {
    expect((await getWorkMixInsights(env)).reading).toBeNull();
  });
});

describe('getThemeInsights', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('reports a Category recurring across more than one Space', async () => {
    await createSpace(env, { title: 'A', categories: ['Risk'] });
    await createSpace(env, { title: 'B', categories: ['Risk'] });
    await createSpace(env, { title: 'C', categories: ['Solo'] });

    const insights = await getThemeInsights(env);
    expect(insights.recurringCategories).toHaveLength(1);
    expect(insights.recurringCategories[0]).toMatchObject({ name: 'Risk', spaceCount: 2 });
    expect(insights.recurringCategories[0].spaceTitles.sort()).toEqual(['A', 'B']);
  });

  it('does not count a Category used in only one Space', async () => {
    await createSpace(env, { title: 'A', categories: ['Unique'] });
    expect((await getThemeInsights(env)).recurringCategories).toEqual([]);
  });

  it('counts every item in every Tensions lane as an open Tension', async () => {
    const space = await createSpace(env, { title: 'Has tensions' });
    const block = await createBlock(env, {
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Cost vs. speed' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    const insights = await getThemeInsights(env);
    expect(insights.openTensionCount).toBe(1);
    expect(insights.openTensions[0]).toMatchObject({
      spaceId: space.id,
      spaceTitle: 'Has tensions',
      blockId: block.id,
      label: 'Cost vs. speed',
    });
  });

  it('excludes the Test Space from both facets', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', categories: ['Risk'] });
    await createSpace(env, { title: 'Real', categories: ['Risk'] });
    // Only one non-Test Space uses "Risk", so it should not recur.
    expect((await getThemeInsights(env)).recurringCategories).toEqual([]);
  });

  it('reading names the most-recurring Category and the open Tension count', async () => {
    await createSpace(env, { title: 'A', categories: ['Risk'] });
    await createSpace(env, { title: 'B', categories: ['Risk'] });
    const space = await createSpace(env, { title: 'Has tensions' });
    await createBlock(env, {
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'x' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    const reading = (await getThemeInsights(env)).reading;
    expect(reading).toContain('Risk');
    expect(reading).toContain('2 Spaces');
    expect(reading).toContain('1 open Tension is');
  });

  it('reading is null when there is nothing recurring and no open Tensions', async () => {
    expect((await getThemeInsights(env)).reading).toBeNull();
  });
});

describe('getActivityTrendInsights', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('flags a Space untouched for more than the stale threshold', async () => {
    const space = await createSpace(env, { title: 'Stale' });
    await env.DB.prepare(`UPDATE spaces SET updated_at = datetime('now', '-45 days') WHERE id = ?`).bind(space.id).run();
    const insights = await getActivityTrendInsights(env);
    expect(insights.staleThresholdDays).toBe(30);
    expect(insights.staleSpaces.map((s) => s.id)).toContain(space.id);
  });

  it('does not flag a recently-updated Space', async () => {
    const space = await createSpace(env, { title: 'Fresh' });
    expect((await getActivityTrendInsights(env)).staleSpaces.map((s) => s.id)).not.toContain(space.id);
  });

  it('excludes the Test Space from staleness even if it is old', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await env.DB.prepare(`UPDATE spaces SET updated_at = datetime('now', '-100 days') WHERE id = ?`).bind(TEST_SPACE_ID).run();
    expect((await getActivityTrendInsights(env)).staleSpaces.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
  });

  it('buckets activity into weekly counts within the requested window', async () => {
    const space = await createSpace(env, { title: 'Active' });
    await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'x' });
    const insights = await getActivityTrendInsights(env, 8);
    const totalBucketed = insights.weeklyCounts.reduce((sum, w) => sum + w.count, 0);
    expect(totalBucketed).toBeGreaterThan(0);
  });

  it('reading names how many Spaces have gone stale', async () => {
    const space = await createSpace(env, { title: 'Stale' });
    await env.DB.prepare(`UPDATE spaces SET updated_at = datetime('now', '-45 days') WHERE id = ?`).bind(space.id).run();
    expect((await getActivityTrendInsights(env)).reading).toContain('1 Space has gone quiet for 30+ days');
  });

  it('reading is null with nothing stale and fewer than two weeks of data', async () => {
    expect((await getActivityTrendInsights(env)).reading).toBeNull();
  });
});

describe('getProvenanceInsights', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('splits Spaces by origin', async () => {
    await createSpace(env, { title: 'External', origin: 'external' });
    await createSpace(env, { title: 'Internal', origin: 'internal' });
    await createSpace(env, { title: 'Ordinary' });
    const insights = await getProvenanceInsights(env);
    expect(insights.byOrigin).toEqual({ external: 1, internal: 1, none: 1 });
  });

  it('counts Syntheses and how many were promoted to Resource status', async () => {
    await createSpace(env, { title: 'Plain synthesis', tags: ['synthesis'] });
    await createSpace(env, { title: 'Promoted synthesis', tags: ['synthesis', 'resource'] });
    await createSpace(env, { title: 'Plain resource', tags: ['resource'] });
    const insights = await getProvenanceInsights(env);
    expect(insights.synthesisCount).toBe(2);
    expect(insights.promotedCount).toBe(1);
  });

  it('counts Work items across every Space', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await createBlock(env, { spaceId: space.id, type: 'hypothesis', content: { statement: 'x' } });
    expect((await getProvenanceInsights(env)).workItemCount).toBe(1);
  });

  it('counts distinct Work items actually used in a Synthesis, reading properties.sourceItemIds off Source Material blocks', async () => {
    const source = await createSpace(env, { title: 'Source' });
    const itemA = await createBlock(env, { spaceId: source.id, type: 'assessment', content: { statement: 'a' } });
    const itemB = await createBlock(env, { spaceId: source.id, type: 'question', content: { statement: 'b' } });
    await createBlock(env, { spaceId: source.id, type: 'insight', content: { statement: 'c' } }); // never used

    const synthesisOne = await createSpace(env, { title: 'Synthesis One', tags: ['synthesis'] });
    await createBlock(env, {
      spaceId: synthesisOne.id,
      type: 'text',
      content: { text: 'copied text' },
      properties: { categories: ['Source Material'], sourceItemIds: [itemA.id, itemB.id] },
    });
    const synthesisTwo = await createSpace(env, { title: 'Synthesis Two', tags: ['synthesis'] });
    await createBlock(env, {
      spaceId: synthesisTwo.id,
      type: 'text',
      content: { text: 'copied text' },
      // Reusing itemA -- used in two Syntheses, but should still only
      // count once toward the distinct total.
      properties: { categories: ['Source Material'], sourceItemIds: [itemA.id] },
    });

    expect((await getProvenanceInsights(env)).distilledWorkItemCount).toBe(2);
  });

  it('excludes the Test Space from every count', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', tags: ['synthesis'], origin: 'internal' });
    const insights = await getProvenanceInsights(env);
    expect(insights.byOrigin.internal).toBe(0);
    expect(insights.synthesisCount).toBe(0);
  });

  it('reading names the origin split and the distilled share', async () => {
    await createSpace(env, { title: 'External', origin: 'external' });
    await createSpace(env, { title: 'Internal', origin: 'internal' });
    const space = await createSpace(env, { title: 'Has work' });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'x' } });
    const reading = (await getProvenanceInsights(env)).reading;
    expect(reading).toContain('33%');
    expect(reading).toContain('0% of raw Work items have actually been distilled');
  });

  it('reading is null when there are no Spaces at all', async () => {
    expect((await getProvenanceInsights(env)).reading).toBeNull();
  });
});

describe('getTimeInsights', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('splits due dates into overdue and upcoming', async () => {
    await createSpace(env, { title: 'Overdue', dueDate: '2000-01-01' });
    await createSpace(env, { title: 'Upcoming', dueDate: '2099-01-01' });
    const insights = await getTimeInsights(env);
    expect(insights.dueDates.overdue.map((s) => s.title)).toEqual(['Overdue']);
    expect(insights.dueDates.upcoming.map((s) => s.title)).toEqual(['Upcoming']);
  });

  it('caps upcoming due dates at 5', async () => {
    for (let i = 0; i < 8; i += 1) {
      await createSpace(env, { title: `Upcoming ${i}`, dueDate: '2099-01-01' });
    }
    expect((await getTimeInsights(env)).dueDates.upcoming).toHaveLength(5);
  });

  it('counts reached Milestones and flags overdue unreached ones', async () => {
    const space = await createSpace(env, { title: 'Has Milestones' });
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Done', targetDate: '2020-01-01', reached: true, reachedAt: '2020-01-01', note: null } });
    const overdueBlock = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Overdue', targetDate: '2000-01-01', reached: false, reachedAt: null, note: null } });
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Future', targetDate: '2099-01-01', reached: false, reachedAt: null, note: null } });

    const insights = await getTimeInsights(env);
    expect(insights.milestones.total).toBe(3);
    expect(insights.milestones.reachedCount).toBe(1);
    expect(insights.milestones.overdueMilestones.map((m) => m.label)).toEqual(['Overdue']);
    expect(insights.milestones.overdueMilestones[0].blockId).toBe(overdueBlock.id);
  });

  it('sums minutes across completed Sessions and counts running ones separately', async () => {
    const space = await createSpace(env, { title: 'Has Sessions' });
    await createBlock(env, { spaceId: space.id, type: 'session', content: { label: 'Done', startedAt: 'x', endedAt: 'y', durationMinutes: 30, note: null } });
    await createBlock(env, { spaceId: space.id, type: 'session', content: { label: 'Running', startedAt: 'x', endedAt: null, durationMinutes: null, note: null } });

    const insights = await getTimeInsights(env);
    expect(insights.sessions.completedCount).toBe(1);
    expect(insights.sessions.totalMinutesLogged).toBe(30);
    expect(insights.sessions.runningCount).toBe(1);
  });

  it('lists Spaces that have never been reviewed', async () => {
    const space = await createSpace(env, { title: 'Never reviewed' });
    expect((await getTimeInsights(env)).review.neverReviewed.map((s) => s.id)).toContain(space.id);
  });

  it('excludes a reviewed Space from neverReviewed and flags a stale review', async () => {
    const space = await createSpace(env, { title: 'Reviewed long ago' });
    const entry = await logTrailEntry(env, { spaceId: space.id, kind: 'review', summary: 'x' });
    await env.DB.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-20 days') WHERE id = ?`).bind(entry.id).run();

    const insights = await getTimeInsights(env);
    expect(insights.review.neverReviewed.map((s) => s.id)).not.toContain(space.id);
    expect(insights.review.staleReviews.map((s) => s.id)).toContain(space.id);
    expect(insights.review.reviewStaleThresholdDays).toBe(14);
  });

  it('does not flag a recently-reviewed Space as stale', async () => {
    const space = await createSpace(env, { title: 'Reviewed recently' });
    await logTrailEntry(env, { spaceId: space.id, kind: 'review', summary: 'x' });
    expect((await getTimeInsights(env)).review.staleReviews.map((s) => s.id)).not.toContain(space.id);
  });

  it('excludes the Test Space from every facet', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', dueDate: '2000-01-01' });
    const insights = await getTimeInsights(env);
    expect(insights.dueDates.overdue).toEqual([]);
    expect(insights.review.neverReviewed.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
  });

  it('reading names overdue counts, Milestone progress, and minutes logged', async () => {
    await createSpace(env, { title: 'Overdue Space', dueDate: '2000-01-01' });
    const space = await createSpace(env, { title: 'Has Milestones and Sessions' });
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Done', targetDate: '2020-01-01', reached: true, reachedAt: '2020-01-01', note: null } });
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Overdue', targetDate: '2000-01-01', reached: false, reachedAt: null, note: null } });
    await createBlock(env, { spaceId: space.id, type: 'session', content: { label: 'Done', startedAt: 'x', endedAt: 'y', durationMinutes: 30, note: null } });

    const reading = (await getTimeInsights(env)).reading;
    expect(reading).toContain('2 things are overdue (1 Space due date, 1 Milestone)');
    expect(reading).toContain('1 of 2 Milestones reached');
    expect(reading).toContain('30 minutes of focused work logged across 1 Session');
  });

  it('reading is null when there is nothing to report', async () => {
    expect((await getTimeInsights(env)).reading).toBeNull();
  });
});
