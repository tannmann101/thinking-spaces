import { describe, it, expect, beforeEach } from 'vitest';
import {
  listResourceTemplates,
  getResourceTemplateById,
  getResourceTemplateByType,
  createResourceTemplate,
  updateResourceTemplate,
  deleteResourceTemplate,
} from '../resourceTemplates.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('resourceTemplates.js', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates a Resource Template with a given facets array and parses it back out', () => {
    const facets = [{ name: 'Core Argument', prompt: 'What is it arguing?' }];
    const template = createResourceTemplate({ type: 'book', label: 'Book', facets });
    expect(template.facets).toEqual(facets);
    expect(template.type).toBe('book');
    expect(template.label).toBe('Book');
  });

  it('accepts a fixed id for a seeded built-in Resource Template', () => {
    const template = createResourceTemplate({ id: 'resource-template-book', type: 'book', label: 'Book', facets: [] });
    expect(template.id).toBe('resource-template-book');
  });

  it('lists Resource Templates alphabetically by label', () => {
    createResourceTemplate({ type: 'z-type', label: 'Zebra', facets: [] });
    createResourceTemplate({ type: 'a-type', label: 'Apple', facets: [] });
    expect(listResourceTemplates().map((t) => t.label)).toEqual(['Apple', 'Zebra']);
  });

  it('looks up a Resource Template by type, case-insensitively', () => {
    createResourceTemplate({ type: 'book', label: 'Book', facets: [] });
    expect(getResourceTemplateByType('BOOK').label).toBe('Book');
    expect(getResourceTemplateByType('book').label).toBe('Book');
  });

  it('returns undefined for a type with no matching Resource Template', () => {
    expect(getResourceTemplateByType('nonexistent')).toBeUndefined();
  });

  it('updates a Resource Template\'s type, label, and facets in place', () => {
    const template = createResourceTemplate({ type: 'draft', label: 'Draft', facets: [] });
    const updated = updateResourceTemplate(template.id, {
      type: 'final',
      label: 'Final',
      facets: [{ name: 'A', prompt: 'a?' }],
    });
    expect(updated.type).toBe('final');
    expect(updated.label).toBe('Final');
    expect(updated.facets).toEqual([{ name: 'A', prompt: 'a?' }]);
  });

  it('deletes a Resource Template', () => {
    const template = createResourceTemplate({ type: 'temp', label: 'Temporary', facets: [] });
    deleteResourceTemplate(template.id);
    expect(getResourceTemplateById(template.id)).toBeUndefined();
  });

  it('deleting a nonexistent Resource Template does not throw', () => {
    expect(() => deleteResourceTemplate('nonexistent')).not.toThrow();
  });
});
