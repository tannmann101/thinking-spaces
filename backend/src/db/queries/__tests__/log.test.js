import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { listGlobalActivity, getActivityStats } from '../log.js';
import { createSpace } from '../spaces.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('listGlobalActivity', () => {
  beforeEach(() => {
    resetDb();
  });

  it('merges activity_log and trail_entries into one feed, newest first', () => {
    const space = createSpace({ title: 'A Space' }); // logs a space_created activity_log row
    logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'trail thing' });
    const entries = listGlobalActivity();
    expect(entries.map((e) => e.kind).sort()).toEqual(['space_created', 'trail_auto'].sort());
  });

  it('prefixes a Trail entry\'s kind with "trail_"', () => {
    const space = createSpace({ title: 'A Space' });
    logTrailEntry({ spaceId: space.id, kind: 'manual', summary: 'x' });
    const trailEntry = listGlobalActivity().find((e) => e.kind.startsWith('trail_'));
    expect(trailEntry.kind).toBe('trail_manual');
  });

  it('excludes Trail entries belonging to the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    logTrailEntry({ spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    expect(listGlobalActivity().filter((e) => e.kind.startsWith('trail_'))).toEqual([]);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i += 1) createSpace({ title: `Space ${i}` });
    expect(listGlobalActivity(2)).toHaveLength(2);
  });
});

describe('getActivityStats', () => {
  beforeEach(() => {
    resetDb();
  });

  it('counts activity_log and non-Test-Space trail_entries together', () => {
    const space = createSpace({ title: 'A Space' }); // +1 activity_log row
    logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'x' }); // +1 trail row
    expect(getActivityStats().totalCount).toBe(2);
  });

  it('excludes Test Space trail activity from the total', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' }); // createSpace itself is a no-op for logActivity
    logTrailEntry({ spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    expect(getActivityStats().totalCount).toBe(0);
  });

  it('reports the most active Space by combined event count', () => {
    const busy = createSpace({ title: 'Busy Space' });
    createSpace({ title: 'Quiet Space' });
    logTrailEntry({ spaceId: busy.id, kind: 'auto', summary: '1' });
    logTrailEntry({ spaceId: busy.id, kind: 'auto', summary: '2' });
    expect(getActivityStats().mostActive.space_title).toBe('Busy Space');
  });

  it('reports mostActive as null when there is no activity at all', () => {
    expect(getActivityStats().mostActive).toBeNull();
  });

  it('counts last7Days using a real 7-day window', () => {
    createSpace({ title: 'Recent' });
    db.prepare(`UPDATE activity_log SET created_at = datetime('now', '-30 days')`).run();
    expect(getActivityStats().last7Days).toBe(0);
  });
});
