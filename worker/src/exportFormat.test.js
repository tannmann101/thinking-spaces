import { describe, it, expect } from 'vitest';
import { renderExportMarkdown } from './exportFormat.js';

// Mirrored verbatim from backend/test/exportFormat.test.js -- the module
// under test is a verbatim copy too, since it touches no database.
function payload(overrides = {}) {
  const tables = {
    templates: [],
    resource_templates: [],
    spaces: [],
    blocks: [],
    workspaces: [],
    projects: [],
    trail_entries: [],
    activity_log: [],
    ...overrides,
  };
  return {
    exportedAt: '2026-09-03T00:00:00.000Z',
    formatVersion: 1,
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
  };
}

const space = { id: 's1', title: 'A Space', status: 'active', tags: '[]', categories: '[]', created_at: '2026-01-01' };

function block(type, content, extra = {}) {
  return { id: 'b1', space_id: 's1', type, content: JSON.stringify(content), properties: '{}', position: 0, ...extra };
}

describe('renderExportMarkdown', () => {
  it('opens with a contents list naming every Space', () => {
    const md = renderExportMarkdown(payload({ spaces: [space, { ...space, id: 's2', title: 'Another' }] }));
    expect(md).toContain('## Contents');
    expect(md).toContain('- A Space');
    expect(md).toContain('- Another');
  });

  it('says so plainly when a Space has no entries', () => {
    expect(renderExportMarkdown(payload({ spaces: [space] }))).toContain('_(no entries)_');
  });

  it('renders a Writing entry line by line, keeping each line own tag', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        blocks: [block('text', { lines: [{ id: 'l1', text: 'A quoted line', tag: 'quote' }] })],
      })
    );
    expect(md).toContain('A quoted line _(quote)_');
  });

  it('renders a List with its checkboxes and secondary fields', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        blocks: [
          block('list', {
            laneLabel: 'Things',
            items: [
              { id: 'i1', text: 'Done one', done: true },
              { id: 'i2', text: 'Counted', number: 12 },
            ],
          }),
        ],
      })
    );
    expect(md).toContain('- [x] Done one');
    expect(md).toContain('Counted _(number: 12)_');
  });

  it('resolves a Reference to the target Space title, not its id', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space, { ...space, id: 's2', title: 'The Target' }],
        blocks: [block('reference', { target_space_id: 's2', note: 'why' })],
      })
    );
    expect(md).toContain('References **The Target**');
    expect(md).not.toContain('References **s2**');
  });

  it('renders any Work Type by its shape, so a future one needs no change here', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        // A type this formatter has never heard of, carrying Work's shape.
        blocks: [block('someFutureWorkType', { statement: 'A claim', support: [{ id: 'p', text: 'because' }], confidence: 'solid' })],
      })
    );
    expect(md).toContain('A claim');
    expect(md).toContain('Confidence: solid');
    expect(md).toContain('Support: because');
  });

  it('resolves a Model relation to its component names', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        blocks: [
          block('model', {
            subject: 'A model',
            components: [{ id: 'c1', name: 'Effort' }, { id: 'c2', name: 'Outcome' }],
            relations: [{ id: 'r1', from: 'c1', to: 'c2', kind: 'produces' }],
          }),
        ],
      })
    );
    expect(md).toContain('Relation: Effort produces Outcome');
  });

  it('includes a Space Trail entries in order', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        trail_entries: [
          { id: 't2', space_id: 's1', kind: 'manual', summary: 'Second', note: 'a note', created_at: '2026-02-02' },
          { id: 't1', space_id: 's1', kind: 'auto', summary: 'First', note: null, created_at: '2026-01-01' },
        ],
      })
    );
    expect(md.indexOf('First')).toBeLessThan(md.indexOf('Second'));
    expect(md).toContain('a note');
  });

  it('lists a Space Workspaces and Projects under Structure', () => {
    const md = renderExportMarkdown(
      payload({
        spaces: [space],
        workspaces: [{ id: 'w1', space_id: 's1', name: 'Etymology' }],
        // A Project reaches a Space through an entry assigned to it.
        blocks: [
          {
            id: 'b1',
            space_id: 's1',
            type: 'milestone',
            content: '{}',
            properties: JSON.stringify({ projectId: 'p1' }),
            position: 0,
          },
        ],
        projects: [{ id: 'p1', name: 'Ship it' }],
      })
    );
    expect(md).toContain('Workspaces: Etymology');
    expect(md).toContain('Projects: Ship it');
  });

  it('survives an unparseable content blob rather than throwing', () => {
    const md = renderExportMarkdown(
      payload({ spaces: [space], blocks: [{ ...block('text', {}), content: 'not json at all' }] })
    );
    expect(md).toContain('_(empty)_');
  });
});
