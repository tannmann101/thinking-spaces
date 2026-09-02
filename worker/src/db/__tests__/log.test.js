import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { listGlobalActivity, getActivityStats } from '../log.js';
import { createSpace } from '../spaces.js';
import { logTrailEntry } from '../trail.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('listGlobalActivity', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('merges activity_log and trail_entries into one feed, newest first', async () => {
    const space = await createSpace(env, { title: 'A Space' }); // logs a space_created activity_log row
    await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'trail thing' });
    const entries = await listGlobalActivity(env);
    expect(entries.map((e) => e.kind).sort()).toEqual(['space_created', 'trail_auto'].sort());
  });

  it('prefixes a Trail entry\'s kind with "trail_"', async () => {
    const space = await createSpace(env, { title: 'A Space' });
    await logTrailEntry(env, { spaceId: space.id, kind: 'manual', summary: 'x' });
    const entries = await listGlobalActivity(env);
    const trailEntry = entries.find((e) => e.kind.startsWith('trail_'));
    expect(trailEntry.kind).toBe('trail_manual');
  });

  it('excludes Trail entries belonging to the Test Space', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await logTrailEntry(env, { spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    const entries = await listGlobalActivity(env);
    expect(entries.filter((e) => e.kind.startsWith('trail_'))).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 5; i += 1) await createSpace(env, { title: `Space ${i}` });
    expect(await listGlobalActivity(env, 2)).toHaveLength(2);
  });
});

describe('getActivityStats', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('counts activity_log and non-Test-Space trail_entries together', async () => {
    const space = await createSpace(env, { title: 'A Space' }); // +1 activity_log row
    await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'x' }); // +1 trail row
    expect((await getActivityStats(env)).totalCount).toBe(2);
  });

  it('excludes Test Space trail activity from the total', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' }); // createSpace itself is a no-op for logActivity
    await logTrailEntry(env, { spaceId: TEST_SPACE_ID, kind: 'auto', summary: 'scratch' });
    expect((await getActivityStats(env)).totalCount).toBe(0);
  });

  it('reports the most active Space by combined event count', async () => {
    const busy = await createSpace(env, { title: 'Busy Space' });
    await createSpace(env, { title: 'Quiet Space' });
    await logTrailEntry(env, { spaceId: busy.id, kind: 'auto', summary: '1' });
    await logTrailEntry(env, { spaceId: busy.id, kind: 'auto', summary: '2' });
    expect((await getActivityStats(env)).mostActive.space_title).toBe('Busy Space');
  });

  it('reports mostActive as null when there is no activity at all', async () => {
    expect((await getActivityStats(env)).mostActive).toBeNull();
  });

  it('counts last7Days using a real 7-day window', async () => {
    await createSpace(env, { title: 'Recent' });
    await env.DB.prepare(`UPDATE activity_log SET created_at = datetime('now', '-30 days')`).run();
    expect((await getActivityStats(env)).last7Days).toBe(0);
  });
});
