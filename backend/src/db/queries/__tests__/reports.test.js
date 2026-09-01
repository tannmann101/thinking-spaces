import { describe, it, expect, beforeEach } from 'vitest';
import { getBlockReport, getWorkspaceReport, getSpaceReport } from '../reports.js';
import { createSpace } from '../spaces.js';
import { createBlock, addBlockToSpace, updateBlockCategories, updateBlockWorkspaces, updateBlockProject } from '../blocks.js';
import { createWorkspace } from '../workspaces.js';
import { createProject } from '../projects.js';
import { logTrailEntry } from '../trail.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('getBlockReport', () => {
  let space;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('returns null for a nonexistent block', () => {
    expect(getBlockReport('nonexistent')).toBeNull();
  });

  it('shares the common report shape', () => {
    const block = createBlock({ spaceId: space.id, type: 'text', content: { text: 'hello' } });
    const report = getBlockReport(block.id);
    expect(report).toMatchObject({ level: 'block', id: block.id });
    expect(typeof report.label).toBe('string');
    expect(typeof report.generatedAt).toBe('string');
    expect(Array.isArray(report.sections)).toBe(true);
  });

  it('labels a Text block by its first non-blank line', () => {
    const block = createBlock({ spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }, { id: '2', text: 'Real content', tag: null }] } });
    expect(getBlockReport(block.id).label).toBe('Real content');
  });

  it('labels an empty Text block as "(empty Writing)"', () => {
    const block = createBlock({ spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }] } });
    expect(getBlockReport(block.id).label).toBe('(empty Writing)');
  });

  it('labels a Work block by its statement', () => {
    const block = createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'The vendor switch is not worth it' } });
    expect(getBlockReport(block.id).label).toBe('The vendor switch is not worth it');
  });

  it('summarizes a List block\'s items, including checkbox state', () => {
    const block = createBlock({
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Done thing', checkbox: true }, { id: '2', text: 'Not done', checkbox: false }] },
    });
    const contentSection = getBlockReport(block.id).sections.find((s) => s.heading === 'Content');
    expect(contentSection.lines[0]).toBe('2 items (1/2 checked)');
    expect(contentSection.lines).toContain('[x] Done thing');
    expect(contentSection.lines).toContain('[ ] Not done');
  });

  it('includes a Membership section only when the block actually belongs to something', () => {
    const bare = createBlock({ spaceId: space.id, type: 'text', content: {} });
    expect(getBlockReport(bare.id).sections.map((s) => s.heading)).not.toContain('Membership');

    const workspace = createWorkspace({ spaceId: space.id, name: 'WS' });
    const filed = createBlock({ spaceId: space.id, type: 'text', content: {} });
    updateBlockCategories(filed.id, ['Risk']);
    updateBlockWorkspaces(filed.id, [workspace.id]);
    const membership = getBlockReport(filed.id).sections.find((s) => s.heading === 'Membership');
    expect(membership.lines).toEqual(['Categories: Risk', 'Workspaces: WS']);
  });

  it('includes a Project membership line for a Milestone/Session assigned to one', () => {
    const project = createProject({ spaceId: space.id, name: 'Ship it' });
    const block = createBlock({ spaceId: space.id, type: 'milestone', content: {} });
    updateBlockProject(block.id, project.id);
    const membership = getBlockReport(block.id).sections.find((s) => s.heading === 'Membership');
    expect(membership.lines).toEqual(['Project: Ship it']);
  });

  it('reports a Milestone\'s target/reached status', () => {
    const block = createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'Ship it', targetDate: '2024-01-01', reached: true, reachedAt: '2024-01-02', note: null } });
    const content = getBlockReport(block.id).sections.find((s) => s.heading === 'Content').lines;
    expect(content).toContain('Status: Reached on 2024-01-02');
  });
});

describe('getWorkspaceReport', () => {
  let space;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it('returns null for a nonexistent Workspace', () => {
    expect(getWorkspaceReport('nonexistent')).toBeNull();
  });

  it('lists only the blocks assembled into this Workspace, not every block on the Space', () => {
    const workspace = createWorkspace({ spaceId: space.id, name: 'Focus' });
    const inWorkspace = createBlock({ spaceId: space.id, type: 'text', content: { text: 'in' } });
    createBlock({ spaceId: space.id, type: 'text', content: { text: 'not in' } });
    updateBlockWorkspaces(inWorkspace.id, [workspace.id]);

    const report = getWorkspaceReport(workspace.id);
    expect(report.label).toBe('Focus');
    const assembled = report.sections.find((s) => s.heading.startsWith('Assembled Tools'));
    expect(assembled.heading).toBe('Assembled Tools (1)');
    expect(assembled.lines).toEqual(['text: in']);
  });
});

describe('getSpaceReport', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns null for a nonexistent Space', () => {
    expect(getSpaceReport('nonexistent')).toBeNull();
  });

  it('is still valid for a brand-new, empty Space', () => {
    const space = createSpace({ title: 'Fresh' });
    const report = getSpaceReport(space.id);
    expect(report.label).toBe('Fresh');
    expect(report.sections.find((s) => s.heading === 'Identity')).toBeTruthy();
    expect(report.sections.find((s) => s.heading.startsWith('Structure'))).toMatchObject({ heading: 'Structure (0 entries)' });
  });

  it('reflects due date, overdue status, tags, categories, and provenance in Identity', () => {
    const space = createSpace({ title: 'Full', tags: ['resource'], categories: ['Risk'], origin: 'external', dueDate: '2000-01-01' });
    const identity = getSpaceReport(space.id).sections.find((s) => s.heading === 'Identity').lines;
    expect(identity).toContain('Due date: 2000-01-01 (overdue)');
    expect(identity).toContain('Tags: resource');
    expect(identity).toContain('Categories: Risk');
    expect(identity).toContain('Provenance: external');
  });

  it('counts block types and lists Workspaces in Structure', () => {
    const space = createSpace({ title: 'Structured' });
    createBlock({ spaceId: space.id, type: 'text', content: {} });
    createBlock({ spaceId: space.id, type: 'text', content: {} });
    createWorkspace({ spaceId: space.id, name: 'My Workspace' });

    const structure = getSpaceReport(space.id).sections.find((s) => s.heading.startsWith('Structure'));
    expect(structure.heading).toBe('Structure (2 entries)');
    expect(structure.lines).toContain('2 text');
    expect(structure.lines).toContain('Workspaces: My Workspace');
  });

  it('includes a Work section only when Work items exist, with confidence breakdown', () => {
    const space = createSpace({ title: 'Has Work' });
    createBlock({ spaceId: space.id, type: 'assessment', content: { statement: 'Claim', confidence: 'solid' } });
    const report = getSpaceReport(space.id);
    const work = report.sections.find((s) => s.heading.startsWith('Work'));
    expect(work.heading).toBe('Work (1 item)');
    expect(work.lines).toContain('1 at "solid" confidence');
  });

  it('omits the Work section for a Space with no Work items', () => {
    const space = createSpace({ title: 'No Work' });
    expect(getSpaceReport(space.id).sections.map((s) => s.heading)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^Work/)])
    );
  });

  it('includes Milestones and Sessions sections only when those blocks exist', () => {
    const space = createSpace({ title: 'Has Time blocks' });
    createBlock({ spaceId: space.id, type: 'milestone', content: { label: 'M', targetDate: null, reached: false, reachedAt: null, note: null } });
    createBlock({ spaceId: space.id, type: 'session', content: { label: 'S', startedAt: 'x', endedAt: 'y', durationMinutes: 20, note: null } });

    const report = getSpaceReport(space.id);
    expect(report.sections.find((s) => s.heading.startsWith('Milestones')).heading).toBe('Milestones (0/1 reached)');
    expect(report.sections.find((s) => s.heading.startsWith('Sessions')).heading).toBe('Sessions (1, 20 min logged)');
  });

  it('includes a Relational section listing both outgoing References and incoming backlinks', () => {
    const target = createSpace({ title: 'Target' });
    const source = createSpace({ title: 'Source' });
    addBlockToSpace(source.id, { type: 'reference', content: { target_space_id: target.id, note: 'why' } });

    const targetReport = getSpaceReport(target.id);
    const relational = targetReport.sections.find((s) => s.heading === 'Relational');
    expect(relational.lines).toEqual(['<- Source (why)']);
  });

  it('includes a Recent Trail section with at most the last 5 entries, most recent first', () => {
    const space = createSpace({ title: 'Has Trail' });
    for (let i = 0; i < 7; i += 1) {
      logTrailEntry({ spaceId: space.id, kind: 'auto', summary: `entry ${i}` });
    }
    const trailSection = getSpaceReport(space.id).sections.find((s) => s.heading === 'Recent Trail');
    expect(trailSection.lines).toHaveLength(5);
    expect(trailSection.lines[0]).toContain('entry 6'); // most recent first
  });
});
