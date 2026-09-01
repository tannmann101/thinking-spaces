import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { listOverdueReviews, listRecentTrailEntries, suggestSpaceToResurface, getNeedsAttentionCount } from '../dashboard.js';
import { createSpace, updateSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('listOverdueReviews', () => {
  beforeEach(() => {
    resetDb();
  });

  it('finds a List item with a reviewBy date in the past', () => {
    const space = createSpace({ title: 'Has a stale item' });
    createBlock({
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Meeting notes', reviewBy: '2000-01-01' }] },
    });
    const overdue = listOverdueReviews();
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ spaceId: space.id, spaceTitle: 'Has a stale item' });
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

describe('listRecentTrailEntries', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns entries from within the requested window, newest first', () => {
    const space = createSpace({ title: 'A Space' });
    const older = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'older' });
    const newer = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'newer' });
    // Pin explicit, clearly-ordered timestamps rather than relying on
    // two real-time calls landing in different SQLite datetime('now')
    // seconds, which they aren't guaranteed to.
    db.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-2 minutes') WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-1 minutes') WHERE id = ?`).run(newer.id);

    const recent = listRecentTrailEntries(7);
    expect(recent.map((e) => e.summary)).toEqual(['newer', 'older']);
    expect(recent[0].spaceTitle).toBe('A Space');
  });

  it('excludes an entry older than the requested window', () => {
    const space = createSpace({ title: 'A Space' });
    const entry = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'ancient' });
    db.prepare(`UPDATE trail_entries SET created_at = datetime('now', '-30 days') WHERE id = ?`).run(entry.id);
    expect(listRecentTrailEntries(7)).toEqual([]);
  });

  it('excludes the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    logTrailEntry({ spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    expect(listRecentTrailEntries(7)).toEqual([]);
  });
});

describe('suggestSpaceToResurface', () => {
  beforeEach(() => {
    resetDb();
  });

  it('suggests the longest-untouched nascent/dormant Space', () => {
    const older = createSpace({ title: 'Old and forgotten' });
    const newer = createSpace({ title: 'Newer nascent' });
    db.prepare(`UPDATE spaces SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE spaces SET updated_at = '2099-01-01 00:00:00' WHERE id = ?`).run(newer.id);
    expect(suggestSpaceToResurface().id).toBe(older.id);
  });

  it('ignores a Space that is not nascent or dormant', () => {
    const space = createSpace({ title: 'Mature already' });
    updateSpace(space.id, { status: 'mature' });
    expect(suggestSpaceToResurface()).toBeNull();
  });

  it('excludes the Test Space even if it is nascent', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
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
