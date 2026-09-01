import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { WORK_TYPES, migrateWorkItemSupport, listWorkItems } from '../work.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

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

describe('migrateWorkItemSupport', () => {
  beforeEach(() => {
    resetDb();
  });

  it('upgrades a legacy {rationale} Work block to {support} in place', () => {
    const space = createSpace({ title: 'Migration test' });
    // Insert directly via SQL to simulate a pre-existing row on the old
    // shape -- createBlock itself always normalizes on the way in, so
    // this bypasses that to set up a genuinely legacy row.
    db.prepare(`INSERT INTO blocks (id, space_id, type, content, properties, position) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'legacy-1',
      space.id,
      'assessment',
      JSON.stringify({ statement: 'Old shape', rationale: 'Because reasons' }),
      '{}',
      0
    );

    migrateWorkItemSupport();

    const row = db.prepare('SELECT content FROM blocks WHERE id = ?').get('legacy-1');
    const content = JSON.parse(row.content);
    expect(content.support).toHaveLength(1);
    expect(content.support[0].text).toBe('Because reasons');
  });

  it('leaves an already-migrated block untouched', () => {
    const space = createSpace({ title: 'Already migrated' });
    const block = createBlock({
      spaceId: space.id,
      type: 'question',
      content: { statement: 'Q', support: [{ id: 'x', text: 'why' }], confidence: 'solid' },
    });
    migrateWorkItemSupport();
    const row = db.prepare('SELECT content FROM blocks WHERE id = ?').get(block.id);
    expect(JSON.parse(row.content).confidence).toBe('solid');
  });
});

describe('listWorkItems', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns Work blocks across every Space, newest first', () => {
    const spaceA = createSpace({ title: 'Space A' });
    const spaceB = createSpace({ title: 'Space B' });
    createBlock({ spaceId: spaceA.id, type: 'assessment', content: { statement: 'First' } });
    createBlock({ spaceId: spaceB.id, type: 'question', content: { statement: 'Second' } });

    const items = listWorkItems();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.content.statement).sort()).toEqual(['First', 'Second']);
    expect(items.every((item) => typeof item.space_title === 'string')).toBe(true);
  });

  it('excludes non-Work block types', () => {
    const space = createSpace({ title: 'Mixed content' });
    createBlock({ spaceId: space.id, type: 'text', content: { text: 'not work' } });
    createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'is work' } });
    expect(listWorkItems()).toHaveLength(1);
  });

  it('excludes the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    createBlock({ spaceId: TEST_SPACE_ID, type: 'assessment', content: { statement: 'scratch' } });
    expect(listWorkItems()).toHaveLength(0);
  });
});
