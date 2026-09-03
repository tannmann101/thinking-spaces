import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { searchEverything } from '../search.js';
import { createSpace, updateSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('searchEverything', async () => {
  let space;

  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'Systems Thinking' });
  });

  it('refuses a query too short to be useful rather than returning everything', async () => {
    expect((await searchEverything(env, 'a')).total).toBe(0);
    expect((await searchEverything(env, '')).total).toBe(0);
    expect((await searchEverything(env, '   ')).total).toBe(0);
  });

  it('finds a Space by title, case-insensitively', async () => {
    const results = await searchEverything(env, 'systems');
    expect(results.spaces.map((s) => s.title)).toEqual(['Systems Thinking']);
  });

  it('finds a Space by what it is working toward', async () => {
    await updateSpace(env, space.id, { goal: 'Understand feedback loops' });
    expect((await searchEverything(env, 'feedback')).spaces).toHaveLength(1);
  });

  it('finds a phrase written inside an entry -- the whole point', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'l1', text: 'The map is not the territory', tag: null }] },
      position: 0,
    });
    const results = await searchEverything(env, 'territory');
    expect(results.blocks).toHaveLength(1);
    expect(results.blocks[0].spaceTitle).toBe('Systems Thinking');
    expect(results.blocks[0].blockId).toEqual(expect.any(String));
  });

  it('returns an excerpt of the prose, not a slice of raw JSON', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'some-id', text: 'The map is not the territory', tag: 'quote' }] },
      position: 0,
    });
    const { excerpt } = (await searchEverything(env, 'territory')).blocks[0];
    expect(excerpt).toContain('The map is not the territory');
    expect(excerpt).not.toContain('some-id');
    expect(excerpt).not.toContain('quote');
  });

  it('drops a row whose only match was plumbing, not prose', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'l1', text: 'Nothing relevant here', tag: 'reflection' }] },
      position: 0,
    });
    // "reflection" appears in the stored JSON, but only as a tag value.
    expect((await searchEverything(env, 'reflection')).blocks).toHaveLength(0);
  });

  it('searches every Tool type, including ones with no prose field by that name', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'hypothesis',
      content: { statement: 'Feedback delays cause overshoot', support: [], confidence: 'tentative' },
      position: 0,
    });
    await createBlock(env, {
      spaceId: space.id,
      type: 'wordEvolution',
      content: { term: 'stock', senses: [{ id: 's1', period: 'Old English', sense: 'A tree trunk', note: '' }] },
      position: 1,
    });
    expect((await searchEverything(env, 'overshoot')).blocks).toHaveLength(1);
    expect((await searchEverything(env, 'tree trunk')).blocks).toHaveLength(1);
  });

  it('counts Spaces and entries together in the total', async () => {
    await createBlock(env, {
      spaceId: space.id,
      type: 'text',
      content: { lines: [{ id: 'l1', text: 'systems everywhere', tag: null }] },
      position: 0,
    });
    const results = await searchEverything(env, 'systems');
    expect(results.spaces).toHaveLength(1);
    expect(results.blocks).toHaveLength(1);
    expect(results.total).toBe(2);
  });
});
