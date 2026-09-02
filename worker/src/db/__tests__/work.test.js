import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { WORK_TYPES, listWorkItems } from '../work.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

// migrateWorkItemSupport has no worker-side equivalent to test -- see
// work.js's own comment: a D1 database starts fresh on the current
// content shapes, so there's never a legacy {rationale} row to migrate.

describe('WORK_TYPES', () => {
  it('lists all eleven current Work Types', () => {
    expect(WORK_TYPES).toEqual([
      'assessment',
      'question',
      'analysis',
      'deduction',
      'definition',
      'demonstration',
      'insight',
      'implication',
      'hypothesis',
      'objection',
      'formulation',
    ]);
  });
});

describe('listWorkItems', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('returns Work blocks across every Space, newest first', async () => {
    const spaceA = await createSpace(env, { title: 'Space A' });
    const spaceB = await createSpace(env, { title: 'Space B' });
    await createBlock(env, { spaceId: spaceA.id, type: 'assessment', content: { statement: 'First' } });
    await createBlock(env, { spaceId: spaceB.id, type: 'question', content: { statement: 'Second' } });

    const items = await listWorkItems(env);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.content.statement).sort()).toEqual(['First', 'Second']);
    expect(items.every((item) => typeof item.space_title === 'string')).toBe(true);
  });

  it('excludes non-Work block types', async () => {
    const space = await createSpace(env, { title: 'Mixed content' });
    await createBlock(env, { spaceId: space.id, type: 'text', content: { text: 'not work' } });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'is work' } });
    expect(await listWorkItems(env)).toHaveLength(1);
  });

  it('excludes the Test Space', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await createBlock(env, { spaceId: TEST_SPACE_ID, type: 'assessment', content: { statement: 'scratch' } });
    expect(await listWorkItems(env)).toHaveLength(0);
  });
});
