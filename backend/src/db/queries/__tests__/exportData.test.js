import { describe, it, expect, beforeEach } from 'vitest';
import { getFullExport, EXPORT_TABLES } from '../exportData.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('getFullExport', () => {
  beforeEach(() => resetDb());

  it('includes every table, even the empty ones', () => {
    const data = getFullExport();
    EXPORT_TABLES.forEach((table) => {
      expect(data.tables[table], `missing table ${table}`).toBeInstanceOf(Array);
      expect(data.counts[table]).toBe(data.tables[table].length);
    });
  });

  it('orders tables so a restore could replay them without tripping a foreign key', () => {
    expect(EXPORT_TABLES.indexOf('spaces')).toBeLessThan(EXPORT_TABLES.indexOf('blocks'));
    expect(EXPORT_TABLES.indexOf('spaces')).toBeLessThan(EXPORT_TABLES.indexOf('workspaces'));
    expect(EXPORT_TABLES.indexOf('spaces')).toBeLessThan(EXPORT_TABLES.indexOf('projects'));
    expect(EXPORT_TABLES.indexOf('spaces')).toBeLessThan(EXPORT_TABLES.indexOf('trail_entries'));
  });

  it('carries the real rows, not just counts', () => {
    const space = createSpace({ title: 'Exported Space' });
    createBlock({ spaceId: space.id, type: 'text', content: { lines: [] }, position: 0 });

    const data = getFullExport();
    expect(data.tables.spaces.map((s) => s.title)).toContain('Exported Space');
    expect(data.tables.blocks).toHaveLength(1);
    expect(data.counts.blocks).toBe(1);
  });

  it('stamps when it was taken and what shape it is', () => {
    const data = getFullExport();
    expect(data.formatVersion).toBe(1);
    expect(Date.parse(data.exportedAt)).not.toBeNaN();
  });
});
