import { describe, it, expect, beforeEach } from 'vitest';
import { listTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate, applyTemplate } from '../templates.js';
import { createSpace } from '../spaces.js';
import { listBlocksForSpace } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('templates.js', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates a Template with a given block_arrangement and parses it back out as an array', () => {
    const arrangement = [{ type: 'text', content: { text: 'starter' } }];
    const template = createTemplate({ name: 'My Template', blockArrangement: arrangement });
    expect(template.block_arrangement).toEqual(arrangement);
  });

  it('accepts a fixed id for a seeded built-in Template', () => {
    const template = createTemplate({ id: 'inquiry', name: 'Inquiry / Analytical', blockArrangement: [] });
    expect(template.id).toBe('inquiry');
  });

  it('lists Templates alphabetically by name', () => {
    createTemplate({ name: 'Zebra', blockArrangement: [] });
    createTemplate({ name: 'Apple', blockArrangement: [] });
    expect(listTemplates().map((t) => t.name)).toEqual(['Apple', 'Zebra']);
  });

  it('updates a Template\'s name and arrangement in place', () => {
    const template = createTemplate({ name: 'Draft', blockArrangement: [] });
    const updated = updateTemplate(template.id, { name: 'Final', blockArrangement: [{ type: 'list', content: {} }] });
    expect(updated.name).toBe('Final');
    expect(updated.block_arrangement).toEqual([{ type: 'list', content: {} }]);
  });

  it('deletes a Template', () => {
    const template = createTemplate({ name: 'Temporary', blockArrangement: [] });
    deleteTemplate(template.id);
    expect(getTemplateById(template.id)).toBeUndefined();
  });

  it('deleting a nonexistent Template does not throw', () => {
    expect(() => deleteTemplate('nonexistent')).not.toThrow();
  });

  describe('applyTemplate', () => {
    it('creates one block per entry in the Template\'s block_arrangement', () => {
      const template = createTemplate({
        name: 'Starter set',
        blockArrangement: [
          { type: 'text', content: { text: 'intro' } },
          { type: 'list', content: { items: [] } },
        ],
      });
      const space = createSpace({ title: 'New Space' });
      applyTemplate(space.id, template.id);
      const blocks = listBlocksForSpace(space.id);
      expect(blocks.map((b) => b.type)).toEqual(['text', 'list']);
    });

    it('does nothing for a nonexistent Template id, rather than throwing', () => {
      const space = createSpace({ title: 'New Space' });
      expect(() => applyTemplate(space.id, 'nonexistent')).not.toThrow();
      expect(listBlocksForSpace(space.id)).toEqual([]);
    });

    it('is a one-time copy: editing the Template afterward does not affect Spaces already created from it', () => {
      const template = createTemplate({ name: 'Evolving', blockArrangement: [{ type: 'text', content: { text: 'v1' } }] });
      const space = createSpace({ title: 'From v1' });
      applyTemplate(space.id, template.id);

      updateTemplate(template.id, { name: 'Evolving', blockArrangement: [{ type: 'text', content: { text: 'v2' } }] });

      const blocks = listBlocksForSpace(space.id);
      expect(blocks[0].content.lines[0].text).toBe('v1');
    });
  });
});
