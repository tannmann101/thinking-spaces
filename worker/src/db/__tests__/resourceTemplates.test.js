import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  listResourceTemplates,
  getResourceTemplateById,
  getResourceTemplateByType,
  createResourceTemplate,
  updateResourceTemplate,
  deleteResourceTemplate,
} from '../resourceTemplates.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('resourceTemplates.js', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates a Resource Template with a given facets array and parses it back out', async () => {
    const facets = [{ name: 'Core Argument', prompt: 'What is it arguing?' }];
    const template = await createResourceTemplate(env, { type: 'book', label: 'Book', facets });
    expect(template.facets).toEqual(facets);
    expect(template.type).toBe('book');
    expect(template.label).toBe('Book');
  });

  it('accepts a fixed id for a seeded built-in Resource Template', async () => {
    const template = await createResourceTemplate(env, { id: 'resource-template-book', type: 'book', label: 'Book', facets: [] });
    expect(template.id).toBe('resource-template-book');
  });

  it('lists Resource Templates alphabetically by label', async () => {
    await createResourceTemplate(env, { type: 'z-type', label: 'Zebra', facets: [] });
    await createResourceTemplate(env, { type: 'a-type', label: 'Apple', facets: [] });
    expect((await listResourceTemplates(env)).map((t) => t.label)).toEqual(['Apple', 'Zebra']);
  });

  it('looks up a Resource Template by type, case-insensitively', async () => {
    await createResourceTemplate(env, { type: 'book', label: 'Book', facets: [] });
    expect((await getResourceTemplateByType(env, 'BOOK')).label).toBe('Book');
    expect((await getResourceTemplateByType(env, 'book')).label).toBe('Book');
  });

  it('returns null for a type with no matching Resource Template', async () => {
    expect(await getResourceTemplateByType(env, 'nonexistent')).toBeNull();
  });

  it('updates a Resource Template\'s type, label, and facets in place', async () => {
    const template = await createResourceTemplate(env, { type: 'draft', label: 'Draft', facets: [] });
    const updated = await updateResourceTemplate(env, template.id, {
      type: 'final',
      label: 'Final',
      facets: [{ name: 'A', prompt: 'a?' }],
    });
    expect(updated.type).toBe('final');
    expect(updated.label).toBe('Final');
    expect(updated.facets).toEqual([{ name: 'A', prompt: 'a?' }]);
  });

  it('deletes a Resource Template', async () => {
    const template = await createResourceTemplate(env, { type: 'temp', label: 'Temporary', facets: [] });
    await deleteResourceTemplate(env, template.id);
    expect(await getResourceTemplateById(env, template.id)).toBeNull();
  });

  it('deleting a nonexistent Resource Template does not throw', async () => {
    await expect(deleteResourceTemplate(env, 'nonexistent')).resolves.not.toThrow();
  });
});
