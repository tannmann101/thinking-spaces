import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { listOverdueReviews, getWeekCalendar, suggestSpaceToResurface, getNeedsAttentionCount } from '../dashboard.js';
import { createSpace, updateSpace } from '../spaces.js';
import { createBlock, updateBlockProject } from '../blocks.js';
import { createProject } from '../projects.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID, todayString } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('listOverdueReviews', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('finds a List item with a reviewBy date in the past', async () => {
    const space = await createSpace(env, { title: 'Has a stale item' });
    const block = await createBlock(env, {
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Meeting notes', reviewBy: '2000-01-01' }] },
    });
    const overdue = await listOverdueReviews(env);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ spaceId: space.id, spaceTitle: 'Has a stale item', blockId: block.id });
    expect(overdue[0].item.text).toBe('Meeting notes');
  });

  it('does not flag an item with a future reviewBy date', async () => {
    const space = await createSpace(env, { title: 'Not due yet' });
    await createBlock(env, { spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2099-01-01' }] } });
    expect(await listOverdueReviews(env)).toEqual([]);
  });

  it('ignores an item with no reviewBy field at all', async () => {
    const space = await createSpace(env, { title: 'No reviewBy' });
    await createBlock(env, { spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x' }] } });
    expect(await listOverdueReviews(env)).toEqual([]);
  });

  it('excludes the Test Space', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await createBlock(env, { spaceId: TEST_SPACE_ID, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    expect(await listOverdueReviews(env)).toEqual([]);
  });
});

describe('getWeekCalendar', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('returns exactly 7 days, Sunday through Saturday, with exactly one marked as today', async () => {
    const days = await getWeekCalendar(env);
    expect(days).toHaveLength(7);
    expect(new Date(`${days[0].date}T00:00:00`).getDay()).toBe(0);
    expect(new Date(`${days[6].date}T00:00:00`).getDay()).toBe(6);
    const todayEntries = days.filter((d) => d.isToday);
    expect(todayEntries).toHaveLength(1);
    expect(todayEntries[0].date).toBe(todayString());
    // Every day before today's slot is in the past; every day at or
    // after it is not -- checked this way (rather than asserting a
    // fixed day index) so the test passes no matter which day of the
    // week it actually runs on.
    const todayIndex = days.findIndex((d) => d.isToday);
    days.forEach((day, index) => {
      expect(day.isPast).toBe(index < todayIndex);
    });
  });

  it('places a Trail entry logged today under today\'s date', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'did a thing' });
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.trail.map((e) => e.summary)).toEqual(['did a thing']);
    expect(today.trail[0].spaceTitle).toBe('A Space');
  });

  it('excludes a Trail entry from outside the current calendar week', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    const entry = await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'ancient' });
    await env.DB.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-30 days') WHERE id = ?`).bind(entry.id).run();
    const days = await getWeekCalendar(env);
    expect(days.every((d) => d.trail.length === 0)).toBe(true);
  });

  it('places a Space due today under today\'s date', async () => {
    const space = await createSpace(env, { title: 'Due today' });
    await updateSpace(env, space.id, { dueDate: todayString() });
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.dueSpaces).toEqual([{ spaceId: space.id, spaceTitle: 'Due today' }]);
  });

  it('excludes a Space due outside the current calendar week', async () => {
    const space = await createSpace(env, { title: 'Due someday' });
    await updateSpace(env, space.id, { dueDate: '2099-01-01' });
    const days = await getWeekCalendar(env);
    expect(days.every((d) => d.dueSpaces.length === 0)).toBe(true);
  });

  it('places a Milestone targeted for today under today\'s date', async () => {
    const space = await createSpace(env, { title: 'Has a Milestone' });
    const milestoneContent = { label: 'Ship it', targetDate: todayString(), reached: false, reachedAt: null, note: '' };
    const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: milestoneContent });
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.milestones).toEqual([
      {
        id: block.id,
        content: milestoneContent,
        label: 'Ship it',
        reached: false,
        spaceId: space.id,
        spaceTitle: 'Has a Milestone',
        projectName: null,
      },
    ]);
  });

  it('resolves a Milestone\'s Project name when it belongs to one', async () => {
    const space = await createSpace(env, { title: 'Has a Project' });
    const project = await createProject(env, { spaceId: space.id, name: 'Ship the redesign' });
    const block = await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: todayString(), reached: false, reachedAt: null, note: '' },
    });
    await updateBlockProject(env, block.id, project.id);
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.milestones[0].projectName).toBe('Ship the redesign');
  });

  it('places a completed Session on the day it ended, and a running one on the day it started', async () => {
    const space = await createSpace(env, { title: 'Has Sessions' });
    await createBlock(env, {
      spaceId: space.id,
      type: 'session',
      content: { label: 'Drafting', startedAt: `${todayString()}T09:00:00.000Z`, endedAt: `${todayString()}T09:45:00.000Z`, durationMinutes: 45, note: '' },
    });
    await createBlock(env, {
      spaceId: space.id,
      type: 'session',
      content: { label: 'Editing', startedAt: `${todayString()}T10:00:00.000Z`, endedAt: null, durationMinutes: null, note: '' },
    });
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.sessions).toHaveLength(2);
    expect(today.sessions.find((s) => s.label === 'Drafting')).toMatchObject({ durationMinutes: 45, isRunning: false });
    expect(today.sessions.find((s) => s.label === 'Editing')).toMatchObject({ durationMinutes: null, isRunning: true });
  });

  it('excludes the Test Space from Trail entries, due dates, Milestones, and Sessions alike', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await logTrailEntry(env, { spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    await updateSpace(env, TEST_SPACE_ID, { dueDate: todayString() });
    await createBlock(env, {
      spaceId: TEST_SPACE_ID,
      type: 'milestone',
      content: { label: 'x', targetDate: todayString(), reached: false, reachedAt: null, note: '' },
    });
    await createBlock(env, {
      spaceId: TEST_SPACE_ID,
      type: 'session',
      content: { label: 'x', startedAt: `${todayString()}T09:00:00.000Z`, endedAt: null, durationMinutes: null, note: '' },
    });
    const days = await getWeekCalendar(env);
    const today = days.find((d) => d.isToday);
    expect(today.trail).toEqual([]);
    expect(today.dueSpaces).toEqual([]);
    expect(today.milestones).toEqual([]);
    expect(today.sessions).toEqual([]);
  });
});

describe('suggestSpaceToResurface', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('suggests the longest-untouched nascent/dormant Space', async () => {
    const older = await createSpace(env, { title: 'Old and forgotten' });
    const newer = await createSpace(env, { title: 'Newer nascent' });
    await env.DB.prepare(`UPDATE spaces SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(older.id).run();
    await env.DB.prepare(`UPDATE spaces SET updated_at = '2099-01-01 00:00:00' WHERE id = ?`).bind(newer.id).run();
    expect((await suggestSpaceToResurface(env)).id).toBe(older.id);
  });

  it('ignores a Space that is not nascent or dormant', async () => {
    const space = await createSpace(env, { title: 'Mature already' });
    await updateSpace(env, space.id, { status: 'mature' });
    expect(await suggestSpaceToResurface(env)).toBeNull();
  });

  it('excludes the Test Space even if it is nascent', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    expect(await suggestSpaceToResurface(env)).toBeNull();
  });

  it('returns null when there are no candidate Spaces at all', async () => {
    expect(await suggestSpaceToResurface(env)).toBeNull();
  });
});

describe('getNeedsAttentionCount', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('is zero when nothing is overdue', async () => {
    await createSpace(env, { title: 'Fine' });
    expect(await getNeedsAttentionCount(env)).toBe(0);
  });

  it('counts an overdue List reviewBy item', async () => {
    const space = await createSpace(env, { title: 'Has a stale item' });
    await createBlock(env, { spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    expect(await getNeedsAttentionCount(env)).toBe(1);
  });

  it('counts an overdue Space due_date', async () => {
    const space = await createSpace(env, { title: 'Overdue Space' });
    await updateSpace(env, space.id, { dueDate: '2000-01-01' });
    expect(await getNeedsAttentionCount(env)).toBe(1);
  });

  it('does not count a Space whose due_date is in the future', async () => {
    const space = await createSpace(env, { title: 'Not due yet' });
    await updateSpace(env, space.id, { dueDate: '2099-01-01' });
    expect(await getNeedsAttentionCount(env)).toBe(0);
  });

  it('counts an overdue, unreached Milestone', async () => {
    const space = await createSpace(env, { title: 'Has a Milestone' });
    await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(await getNeedsAttentionCount(env)).toBe(1);
  });

  it('does not count a Milestone that was already reached, even past its target date', async () => {
    const space = await createSpace(env, { title: 'Reached already' });
    await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Shipped', targetDate: '2000-01-01', reached: true, reachedAt: '2000-01-02', note: '' },
    });
    expect(await getNeedsAttentionCount(env)).toBe(0);
  });

  it('sums all three kinds together', async () => {
    const space = await createSpace(env, { title: 'Everything at once' });
    await updateSpace(env, space.id, { dueDate: '2000-01-01' });
    await createBlock(env, { spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'x', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(await getNeedsAttentionCount(env)).toBe(3);
  });

  it('excludes the Test Space entirely', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await updateSpace(env, TEST_SPACE_ID, { dueDate: '2000-01-01' });
    await createBlock(env, {
      spaceId: TEST_SPACE_ID,
      type: 'milestone',
      content: { label: 'x', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(await getNeedsAttentionCount(env)).toBe(0);
  });
});
