import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { getWorkMixInsights, getThemeInsights, getActivityTrendInsights, getProvenanceInsights, getTimeInsights } from '../insights.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('getWorkMixInsights', () => {
  beforeEach(() => {
    resetDb();
  });

  it('counts Work items by type and by confidence', () => {
    const space = createSpace({ title: 'A Space' });
    createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'a', confidence: 'solid' } });
    createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'b', confidence: 'solid' } });
    createBlock({ spaceId: space.id, type: 'question', content: { statement: 'c', confidence: 'questioned' } });

    const insights = getWorkMixInsights();
    expect(insights.total).toBe(3);
    expect(insights.byType.find((t) => t.type === 'assessment').count).toBe(2);
    expect(insights.byType.find((t) => t.type === 'question').count).toBe(1);
    expect(insights.byConfidence.find((c) => c.level === 'solid').count).toBe(2);
    expect(insights.byConfidence.find((c) => c.level === 'questioned').count).toBe(1);
  });

  it('defaults a missing confidence to tentative', () => {
    const space = createSpace({ title: 'A Space' });
    db.prepare(`INSERT INTO blocks (id, space_id, type, content, properties, position) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'no-confidence', space.id, 'assessment', JSON.stringify({ statement: 'x' }), '{}', 0
    );
    expect(getWorkMixInsights().byConfidence.find((c) => c.level === 'tentative').count).toBe(1);
  });

  it('excludes non-Work blocks and the Test Space', () => {
    const space = createSpace({ title: 'A Space' });
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    createBlock({ spaceId: space.id, type: 'text', content: {} });
    createBlock({ spaceId: TEST_SPACE_ID, type: 'assessment', content: { statement: 'scratch' } });
    expect(getWorkMixInsights().total).toBe(0);
  });
});

describe('getThemeInsights', () => {
  beforeEach(() => {
    resetDb();
  });

  it('reports a Category recurring across more than one Space', () => {
    createSpace({ title: 'A', categories: ['Risk'] });
    createSpace({ title: 'B', categories: ['Risk'] });
    createSpace({ title: 'C', categories: ['Solo'] });

    const insights = getThemeInsights();
    expect(insights.recurringCategories).toHaveLength(1);
    expect(insights.recurringCategories[0]).toMatchObject({ name: 'Risk', spaceCount: 2 });
    expect(insights.recurringCategories[0].spaceTitles.sort()).toEqual(['A', 'B']);
  });

  it('does not count a Category used in only one Space', () => {
    createSpace({ title: 'A', categories: ['Unique'] });
    expect(getThemeInsights().recurringCategories).toEqual([]);
  });

  it('counts every item in every Tensions lane as an open Tension', () => {
    const space = createSpace({ title: 'Has tensions' });
    createBlock({
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Cost vs. speed' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    const insights = getThemeInsights();
    expect(insights.openTensionCount).toBe(1);
    expect(insights.openTensions[0]).toMatchObject({ spaceId: space.id, spaceTitle: 'Has tensions', label: 'Cost vs. speed' });
  });

  it('excludes the Test Space from both facets', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space', categories: ['Risk'] });
    createSpace({ title: 'Real', categories: ['Risk'] });
    // Only one non-Test Space uses "Risk", so it should not recur.
    expect(getThemeInsights().recurringCategories).toEqual([]);
  });
});

describe('getActivityTrendInsights', () => {
  beforeEach(() => {
    resetDb();
  });

  it('flags a Space untouched for more than the stale threshold', () => {
    const space = createSpace({ title: 'Stale' });
    db.prepare(`UPDATE spaces SET updated_at = datetime('now', '-45 days') WHERE id = ?`).run(space.id);
    const insights = getActivityTrendInsights();
    expect(insights.staleThresholdDays).toBe(30);
    expect(insights.staleSpaces.map((s) => s.id)).toContain(space.id);
  });

  it('does not flag a recently-updated Space', () => {
    const space = createSpace({ title: 'Fresh' });
    expect(getActivityTrendInsights().staleSpaces.map((s) => s.id)).not.toContain(space.id);
  });

  it('excludes the Test Space from staleness even if it is old', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    db.prepare(`UPDATE spaces SET updated_at = datetime('now', '-100 days') WHERE id = ?`).run(TEST_SPACE_ID);
    expect(getActivityTrendInsights().staleSpaces.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
  });

  it('buckets activity into weekly counts within the requested window', () => {
    const space = createSpace({ title: 'Active' });
    logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'x' });
    const insights = getActivityTrendInsights(8);
    const totalBucketed = insights.weeklyCounts.reduce((sum, w) => sum + w.count, 0);
    expect(totalBucketed).toBeGreaterThan(0);
  });
});

describe('getProvenanceInsights', () => {
  beforeEach(() => {
    resetDb();
  });

  it('splits Spaces by origin', () => {
    createSpace({ title: 'External', origin: 'external' });
    createSpace({ title: 'Internal', origin: 'internal' });
    createSpace({ title: 'Ordinary' });
    const insights = getProvenanceInsights();
    expect(insights.byOrigin).toEqual({ external: 1, internal: 1, none: 1 });
  });

  it('counts Syntheses and how many were promoted to Resource status', () => {
    createSpace({ title: 'Plain synthesis', tags: ['synthesis'] });
    createSpace({ title: 'Promoted synthesis', tags: ['synthesis', 'resource'] });
    createSpace({ title: 'Plain resource', tags: ['resource'] });
    const insights = getProvenanceInsights();
    expect(insights.synthesisCount).toBe(2);
    expect(insights.promotedCount).toBe(1);
  });

  it('counts Work items across every Space', () => {
    const space = createSpace({ title: 'A Space' });
    createBlock({ spaceId: space.id, type: 'hypothesis', content: { statement: 'x' } });
    expect(getProvenanceInsights().workItemCount).toBe(1);
  });

  it('excludes the Test Space from every count', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space', tags: ['synthesis'], origin: 'internal' });
    const insights = getProvenanceInsights();
    expect(insights.byOrigin.internal).toBe(0);
    expect(insights.synthesisCount).toBe(0);
  });
});

describe('getTimeInsights', () => {
  beforeEach(() => {
    resetDb();
  });

  it('splits due dates into overdue and upcoming', () => {
    createSpace({ title: 'Overdue', dueDate: '2000-01-01' });
    createSpace({ title: 'Upcoming', dueDate: '2099-01-01' });
    const insights = getTimeInsights();
    expect(insights.dueDates.overdue.map((s) => s.title)).toEqual(['Overdue']);
    expect(insights.dueDates.upcoming.map((s) => s.title)).toEqual(['Upcoming']);
  });

  it('caps upcoming due dates at 5', () => {
    for (let i = 0; i < 8; i += 1) {
      createSpace({ title: `Upcoming ${i}`, dueDate: '2099-01-01' });
    }
    expect(getTimeInsights().dueDates.upcoming).toHaveLength(5);
  });

  it('counts reached Milestones and flags overdue unreached ones', () => {
    const space = createSpace({ title: 'Has Milestones' });
    createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Done', targetDate: '2020-01-01', reached: true, reachedAt: '2020-01-01', note: null } });
    createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Overdue', targetDate: '2000-01-01', reached: false, reachedAt: null, note: null } });
    createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Future', targetDate: '2099-01-01', reached: false, reachedAt: null, note: null } });

    const insights = getTimeInsights();
    expect(insights.milestones.total).toBe(3);
    expect(insights.milestones.reachedCount).toBe(1);
    expect(insights.milestones.overdueMilestones.map((m) => m.label)).toEqual(['Overdue']);
  });

  it('sums minutes across completed Sessions and counts running ones separately', () => {
    const space = createSpace({ title: 'Has Sessions' });
    createBlock({ spaceId: space.id, type: 'session', content: { label: 'Done', startedAt: 'x', endedAt: 'y', durationMinutes: 30, note: null } });
    createBlock({ spaceId: space.id, type: 'session', content: { label: 'Running', startedAt: 'x', endedAt: null, durationMinutes: null, note: null } });

    const insights = getTimeInsights();
    expect(insights.sessions.completedCount).toBe(1);
    expect(insights.sessions.totalMinutesLogged).toBe(30);
    expect(insights.sessions.runningCount).toBe(1);
  });

  it('lists Spaces that have never been reviewed', () => {
    const space = createSpace({ title: 'Never reviewed' });
    expect(getTimeInsights().review.neverReviewed.map((s) => s.id)).toContain(space.id);
  });

  it('excludes a reviewed Space from neverReviewed and flags a stale review', () => {
    const space = createSpace({ title: 'Reviewed long ago' });
    const entry = logTrailEntry({ spaceId: space.id, kind: 'review', summary: 'x' });
    db.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-20 days') WHERE id = ?`).run(entry.id);

    const insights = getTimeInsights();
    expect(insights.review.neverReviewed.map((s) => s.id)).not.toContain(space.id);
    expect(insights.review.staleReviews.map((s) => s.id)).toContain(space.id);
    expect(insights.review.reviewStaleThresholdDays).toBe(14);
  });

  it('does not flag a recently-reviewed Space as stale', () => {
    const space = createSpace({ title: 'Reviewed recently' });
    logTrailEntry({ spaceId: space.id, kind: 'review', summary: 'x' });
    expect(getTimeInsights().review.staleReviews.map((s) => s.id)).not.toContain(space.id);
  });

  it('excludes the Test Space from every facet', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space', dueDate: '2000-01-01' });
    const insights = getTimeInsights();
    expect(insights.dueDates.overdue).toEqual([]);
    expect(insights.review.neverReviewed.map((s) => s.id)).not.toContain(TEST_SPACE_ID);
  });
});
