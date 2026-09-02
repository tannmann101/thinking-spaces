import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { listTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate, applyTemplate } from '../templates.js';
import { createSpace } from '../spaces.js';
import { listBlocksForSpace } from '../blocks.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('templates.js', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates a Template with a given block_arrangement and parses it back out as an array', async () => {
    const arrangement = [{ type: 'text', content: { text: 'starter' } }];
    const template = await createTemplate(env, { name: 'My Template', blockArrangement: arrangement });
    expect(template.block_arrangement).toEqual(arrangement);
  });

  it('accepts a fixed id for a seeded built-in Template', async () => {
    const template = await createTemplate(env, { id: 'inquiry', name: 'Inquiry / Analytical', blockArrangement: [] });
    expect(template.id).toBe('inquiry');
  });

  it('lists Templates alphabetically by name', async () => {
    await createTemplate(env, { name: 'Zebra', blockArrangement: [] });
    await createTemplate(env, { name: 'Apple', blockArrangement: [] });
    expect((await listTemplates(env)).map((t) => t.name)).toEqual(['Apple', 'Zebra']);
  });

  it('updates a Template\'s name and arrangement in place', async () => {
    const template = await createTemplate(env, { name: 'Draft', blockArrangement: [] });
    const updated = await updateTemplate(env, template.id, { name: 'Final', blockArrangement: [{ type: 'list', content: {} }] });
    expect(updated.name).toBe('Final');
    expect(updated.block_arrangement).toEqual([{ type: 'list', content: {} }]);
  });

  it('deletes a Template', async () => {
    const template = await createTemplate(env, { name: 'Temporary', blockArrangement: [] });
    await deleteTemplate(env, template.id);
    expect(await getTemplateById(env, template.id)).toBeNull();
  });

  it('deleting a nonexistent Template does not throw', async () => {
    await expect(deleteTemplate(env, 'nonexistent')).resolves.not.toThrow();
  });

  describe('applyTemplate', () => {
    it('creates one block per entry in the Template\'s block_arrangement', async () => {
      const template = await createTemplate(env, {
        name: 'Starter set',
        blockArrangement: [
          { type: 'text', content: { text: 'intro' } },
          { type: 'list', content: { items: [] } },
        ],
      });
      const space = await createSpace(env, { title: 'New Space' });
      await applyTemplate(env, space.id, template.id);
      const blocks = await listBlocksForSpace(env, space.id);
      expect(blocks.map((b) => b.type)).toEqual(['text', 'list']);
    });

    it('does nothing for a nonexistent Template id, rather than throwing', async () => {
      const space = await createSpace(env, { title: 'New Space' });
      await expect(applyTemplate(env, space.id, 'nonexistent')).resolves.not.toThrow();
      expect(await listBlocksForSpace(env, space.id)).toEqual([]);
    });

    it('is a one-time copy: editing the Template afterward does not affect Spaces already created from it', async () => {
      const template = await createTemplate(env, { name: 'Evolving', blockArrangement: [{ type: 'text', content: { text: 'v1' } }] });
      const space = await createSpace(env, { title: 'From v1' });
      await applyTemplate(env, space.id, template.id);

      await updateTemplate(env, template.id, { name: 'Evolving', blockArrangement: [{ type: 'text', content: { text: 'v2' } }] });

      const blocks = await listBlocksForSpace(env, space.id);
      expect(blocks[0].content.lines[0].text).toBe('v1');
    });
  });
});
