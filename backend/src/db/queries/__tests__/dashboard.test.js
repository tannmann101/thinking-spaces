import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { listOverdueReviews, getWeekCalendar, suggestSpaceToResurface, getNeedsAttentionCount } from '../dashboard.js';
import { createSpace, updateSpace } from '../spaces.js';
import { createBlock, updateBlockProject } from '../blocks.js';
import { createProject } from '../projects.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID, todayString } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('listOverdueReviews', () => {
  beforeEach(() => {
    resetDb();
  });

  it('finds a List item with a reviewBy date in the past', () => {
    const space = createSpace({ title: 'Has a stale item' });
    const block = createBlock({
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Meeting notes', reviewBy: '2000-01-01' }] },
    });
    const overdue = listOverdueReviews();
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ spaceId: space.id, spaceTitle: 'Has a stale item', blockId: block.id });
    expect(overdue[0].item.text).toBe('Meeting notes');
  });

  it('does not flag an item with a future reviewBy date', () => {
    const space = createSpace({ title: 'Not due yet' });
    createBlock({ spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2099-01-01' }] } });
    expect(listOverdueReviews()).toEqual([]);
  });

  it('ignores an item with no reviewBy field at all', () => {
    const space = createSpace({ title: 'No reviewBy' });
    createBlock({ spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x' }] } });
    expect(listOverdueReviews()).toEqual([]);
  });

  it('excludes the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    createBlock({ spaceId: TEST_SPACE_ID, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    expect(listOverdueReviews()).toEqual([]);
  });
});

describe('getWeekCalendar', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns exactly 7 days, Sunday through Saturday, with exactly one marked as today', () => {
    const days = getWeekCalendar();
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

  it('places a Trail entry logged today under today\'s date', () => {
    const space = createSpace({ title: 'A Space' });
    logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'did a thing' });
    const days = getWeekCalendar();
    const today = days.find((d) => d.isToday);
    expect(today.trail.map((e) => e.summary)).toEqual(['did a thing']);
    expect(today.trail[0].spaceTitle).toBe('A Space');
  });

  it('excludes a Trail entry from outside the current calendar week', () => {
    const space = createSpace({ title: 'A Space' });
    const entry = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'ancient' });
    db.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-30 days') WHERE id = ?`).run(entry.id);
    const days = getWeekCalendar();
    expect(days.every((d) => d.trail.length === 0)).toBe(true);
  });

  it('places a Space due today under today\'s date', () => {
    const space = createSpace({ title: 'Due today' });
    updateSpace(space.id, { dueDate: todayString() });
    const days = getWeekCalendar();
    const today = days.find((d) => d.isToday);
    expect(today.dueSpaces).toEqual([{ spaceId: space.id, spaceTitle: 'Due today' }]);
  });

  it('excludes a Space due outside the current calendar week', () => {
    const space = createSpace({ title: 'Due someday' });
    updateSpace(space.id, { dueDate: '2099-01-01' });
    const days = getWeekCalendar();
    expect(days.every((d) => d.dueSpaces.length === 0)).toBe(true);
  });

  it('places a Milestone targeted for today under today\'s date', () => {
    const space = createSpace({ title: 'Has a Milestone' });
    const milestoneContent = { label: 'Ship it', targetDate: todayString(), reached: false, reachedAt: null, note: '' };
    const block = createBlock({ spaceId: space.id, type: 'milestone', content: milestoneContent });
    const days = getWeekCalendar();
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

  it('resolves a Milestone\'s Project name when it belongs to one', () => {
    const space = createSpace({ title: 'Has a Project' });
    const project = createProject({ name: 'Ship the redesign' });
    const block = createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: todayString(), reached: false, reachedAt: null, note: '' },
    });
    updateBlockProject(block.id, project.id);
    const days = getWeekCalendar();
    const today = days.find((d) => d.isToday);
    expect(today.milestones[0].projectName).toBe('Ship the redesign');
  });

  it('places a completed Session on the day it ended, and a running one on the day it started', () => {
    const space = createSpace({ title: 'Has Sessions' });
    createBlock({
      spaceId: space.id,
      type: 'session',
      content: { label: 'Drafting', startedAt: `${todayString()}T09:00:00.000Z`, endedAt: `${todayString()}T09:45:00.000Z`, durationMinutes: 45, note: '' },
    });
    createBlock({
      spaceId: space.id,
      type: 'session',
      content: { label: 'Editing', startedAt: `${todayString()}T10:00:00.000Z`, endedAt: null, durationMinutes: null, note: '' },
    });
    const days = getWeekCalendar();
    const today = days.find((d) => d.isToday);
    expect(today.sessions).toHaveLength(2);
    expect(today.sessions.find((s) => s.label === 'Drafting')).toMatchObject({ durationMinutes: 45, isRunning: false });
    expect(today.sessions.find((s) => s.label === 'Editing')).toMatchObject({ durationMinutes: null, isRunning: true });
  });

  it('excludes the Test Space from Trail entries, due dates, Milestones, and Sessions alike', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    logTrailEntry({ spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    updateSpace(TEST_SPACE_ID, { dueDate: todayString() });
    createBlock({
      spaceId: TEST_SPACE_ID,
      type: 'milestone',
      content: { label: 'x', targetDate: todayString(), reached: false, reachedAt: null, note: '' },
    });
    createBlock({
      spaceId: TEST_SPACE_ID,
      type: 'session',
      content: { label: 'x', startedAt: `${todayString()}T09:00:00.000Z`, endedAt: null, durationMinutes: null, note: '' },
    });
    const days = getWeekCalendar();
    const today = days.find((d) => d.isToday);
    expect(today.trail).toEqual([]);
    expect(today.dueSpaces).toEqual([]);
    expect(today.milestones).toEqual([]);
    expect(today.sessions).toEqual([]);
  });
});

describe('suggestSpaceToResurface', () => {
  beforeEach(() => {
    resetDb();
  });

  it('suggests the longest-untouched dormant/inactive Space', () => {
    const older = createSpace({ title: 'Old and forgotten', status: 'inactive' });
    const newer = createSpace({ title: 'Newer dormant', status: 'dormant' });
    db.prepare(`UPDATE spaces SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE spaces SET updated_at = '2099-01-01 00:00:00' WHERE id = ?`).run(newer.id);
    expect(suggestSpaceToResurface().id).toBe(older.id);
  });

  it('ignores a Space that is not dormant or inactive', () => {
    const space = createSpace({ title: 'Mature already' });
    updateSpace(space.id, { status: 'mature' });
    expect(suggestSpaceToResurface()).toBeNull();
  });

  it('ignores an active Space -- "active" is the new default, so this is the common case', () => {
    createSpace({ title: 'Being worked on right now' });
    expect(suggestSpaceToResurface()).toBeNull();
  });

  it('excludes the Test Space even if it is dormant', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space', status: 'dormant' });
    expect(suggestSpaceToResurface()).toBeNull();
  });

  it('returns null when there are no candidate Spaces at all', () => {
    expect(suggestSpaceToResurface()).toBeNull();
  });
});

describe('getNeedsAttentionCount', () => {
  beforeEach(() => {
    resetDb();
  });

  it('is zero when nothing is overdue', () => {
    createSpace({ title: 'Fine' });
    expect(getNeedsAttentionCount()).toBe(0);
  });

  it('counts an overdue List reviewBy item', () => {
    const space = createSpace({ title: 'Has a stale item' });
    createBlock({ spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    expect(getNeedsAttentionCount()).toBe(1);
  });

  it('counts an overdue Space due_date', () => {
    const space = createSpace({ title: 'Overdue Space' });
    updateSpace(space.id, { dueDate: '2000-01-01' });
    expect(getNeedsAttentionCount()).toBe(1);
  });

  it('does not count a Space whose due_date is in the future', () => {
    const space = createSpace({ title: 'Not due yet' });
    updateSpace(space.id, { dueDate: '2099-01-01' });
    expect(getNeedsAttentionCount()).toBe(0);
  });

  it('counts an overdue, unreached Milestone', () => {
    const space = createSpace({ title: 'Has a Milestone' });
    createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(getNeedsAttentionCount()).toBe(1);
  });

  it('does not count a Milestone that was already reached, even past its target date', () => {
    const space = createSpace({ title: 'Reached already' });
    createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Shipped', targetDate: '2000-01-01', reached: true, reachedAt: '2000-01-02', note: '' },
    });
    expect(getNeedsAttentionCount()).toBe(0);
  });

  it('sums all three kinds together', () => {
    const space = createSpace({ title: 'Everything at once' });
    updateSpace(space.id, { dueDate: '2000-01-01' });
    createBlock({ spaceId: space.id, type: 'list', content: { items: [{ id: '1', text: 'x', reviewBy: '2000-01-01' }] } });
    createBlock({
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'x', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(getNeedsAttentionCount()).toBe(3);
  });

  it('excludes the Test Space entirely', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    updateSpace(TEST_SPACE_ID, { dueDate: '2000-01-01' });
    createBlock({
      spaceId: TEST_SPACE_ID,
      type: 'milestone',
      content: { label: 'x', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' },
    });
    expect(getNeedsAttentionCount()).toBe(0);
  });
});
