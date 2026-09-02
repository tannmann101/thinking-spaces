import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { getBlockReport, getWorkspaceReport, getProjectReport, getSpaceReport } from '../reports.js';
import { createSpace } from '../spaces.js';
import { createBlock, addBlockToSpace, updateBlockCategories, updateBlockWorkspaces, updateBlockProject } from '../blocks.js';
import { createWorkspace } from '../workspaces.js';
import { createProject } from '../projects.js';
import { logTrailEntry } from '../trail.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('getBlockReport', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('returns null for a nonexistent block', async () => {
    expect(await getBlockReport(env, 'nonexistent')).toBeNull();
  });

  it('shares the common report shape', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { text: 'hello' } });
    const report = await getBlockReport(env, block.id);
    expect(report).toMatchObject({ level: 'block', id: block.id });
    expect(typeof report.label).toBe('string');
    expect(typeof report.generatedAt).toBe('string');
    expect(Array.isArray(report.sections)).toBe(true);
  });

  it('labels a Text block by its first non-blank line', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }, { id: '2', text: 'Real content', tag: null }] } });
    expect((await getBlockReport(env, block.id)).label).toBe('Real content');
  });

  it('labels an empty Text block as "(empty Writing)"', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'text', content: { lines: [{ id: '1', text: '', tag: null }] } });
    expect((await getBlockReport(env, block.id)).label).toBe('(empty Writing)');
  });

  it('labels a Work block by its statement', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'The vendor switch is not worth it' } });
    expect((await getBlockReport(env, block.id)).label).toBe('The vendor switch is not worth it');
  });

  it('summarizes a List block\'s items, including checkbox state', async () => {
    const block = await createBlock(env, {
      spaceId: space.id,
      type: 'list',
      content: { items: [{ id: '1', text: 'Done thing', checkbox: true }, { id: '2', text: 'Not done', checkbox: false }] },
    });
    const report = await getBlockReport(env, block.id);
    const contentSection = report.sections.find((s) => s.heading === 'Content');
    expect(contentSection.lines[0]).toBe('2 items (1/2 checked)');
    expect(contentSection.lines).toContain('[x] Done thing');
    expect(contentSection.lines).toContain('[ ] Not done');
  });

  it('includes a Membership section only when the block actually belongs to something', async () => {
    const bare = await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    expect((await getBlockReport(env, bare.id)).sections.map((s) => s.heading)).not.toContain('Membership');

    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'WS' });
    const filed = await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await updateBlockCategories(env, filed.id, ['Risk']);
    await updateBlockWorkspaces(env, filed.id, [workspace.id]);
    const report = await getBlockReport(env, filed.id);
    const membership = report.sections.find((s) => s.heading === 'Membership');
    expect(membership.lines).toEqual(['Categories: Risk', 'Workspaces: WS']);
  });

  it('includes a Project membership line for a Milestone/Session assigned to one', async () => {
    const project = await createProject(env, { spaceId: space.id, name: 'Ship it' });
    const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {} });
    await updateBlockProject(env, block.id, project.id);
    const report = await getBlockReport(env, block.id);
    const membership = report.sections.find((s) => s.heading === 'Membership');
    expect(membership.lines).toEqual(['Project: Ship it']);
  });

  it('reports a Milestone\'s target/reached status', async () => {
    const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'Ship it', targetDate: '2024-01-01', reached: true, reachedAt: '2024-01-02', note: null } });
    const report = await getBlockReport(env, block.id);
    const content = report.sections.find((s) => s.heading === 'Content').lines;
    expect(content).toContain('Status: Reached on 2024-01-02');
  });
});

describe('getWorkspaceReport', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('returns null for a nonexistent Workspace', async () => {
    expect(await getWorkspaceReport(env, 'nonexistent')).toBeNull();
  });

  it('lists only the blocks assembled into this Workspace, not every block on the Space', async () => {
    const workspace = await createWorkspace(env, { spaceId: space.id, name: 'Focus' });
    const inWorkspace = await createBlock(env, { spaceId: space.id, type: 'text', content: { text: 'in' } });
    await createBlock(env, { spaceId: space.id, type: 'text', content: { text: 'not in' } });
    await updateBlockWorkspaces(env, inWorkspace.id, [workspace.id]);

    const report = await getWorkspaceReport(env, workspace.id);
    expect(report.label).toBe('Focus');
    const assembled = report.sections.find((s) => s.heading.startsWith('Assembled Tools'));
    expect(assembled.heading).toBe('Assembled Tools (1)');
    expect(assembled.lines).toEqual(['text: in']);
  });
});

describe('getProjectReport', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  it('returns null for a nonexistent Project', async () => {
    expect(await getProjectReport(env, 'nonexistent')).toBeNull();
  });

  it('lists only the Milestones/Sessions assigned to this Project, with a reached/logged-minutes readout', async () => {
    const project = await createProject(env, { spaceId: space.id, name: 'Ship it' });
    const milestone = await createBlock(env, {
      spaceId: space.id,
      type: 'milestone',
      content: { label: 'Ship it', targetDate: null, reached: true, reachedAt: '2024-01-01', note: null },
    });
    await updateBlockProject(env, milestone.id, project.id);
    const session = await createBlock(env, {
      spaceId: space.id,
      type: 'session',
      content: { label: 'Drafting', startedAt: null, endedAt: null, durationMinutes: 30, note: null },
    });
    await updateBlockProject(env, session.id, project.id);
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { reached: false } }); // not assigned

    const report = await getProjectReport(env, project.id);
    expect(report.label).toBe('Ship it');
    const assigned = report.sections.find((s) => s.heading.startsWith('Assigned'));
    expect(assigned.heading).toBe('Assigned Milestones & Sessions (2)');
    expect(assigned.lines).toContain('Milestones: 1 of 1 reached');
    expect(assigned.lines).toContain('Sessions: 30 min logged across 1');
  });
});

describe('getSpaceReport', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('returns null for a nonexistent Space', async () => {
    expect(await getSpaceReport(env, 'nonexistent')).toBeNull();
  });

  it('is still valid for a brand-new, empty Space', async () => {
    const space = await createSpace(env, { title: 'Fresh' });
    const report = await getSpaceReport(env, space.id);
    expect(report.label).toBe('Fresh');
    expect(report.sections.find((s) => s.heading === 'Identity')).toBeTruthy();
    expect(report.sections.find((s) => s.heading.startsWith('Structure'))).toMatchObject({ heading: 'Structure (0 entries)' });
  });

  it('reflects due date, overdue status, tags, categories, and provenance in Identity', async () => {
    const space = await createSpace(env, { title: 'Full', tags: ['resource'], categories: ['Risk'], origin: 'external', dueDate: '2000-01-01' });
    const report = await getSpaceReport(env, space.id);
    const identity = report.sections.find((s) => s.heading === 'Identity').lines;
    expect(identity).toContain('Due date: 2000-01-01 (overdue)');
    expect(identity).toContain('Tags: resource');
    expect(identity).toContain('Categories: Risk');
    expect(identity).toContain('Provenance: external');
  });

  it('counts block types and lists Workspaces and Projects in Structure', async () => {
    const space = await createSpace(env, { title: 'Structured' });
    await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await createBlock(env, { spaceId: space.id, type: 'text', content: {} });
    await createWorkspace(env, { spaceId: space.id, name: 'My Workspace' });
    await createProject(env, { spaceId: space.id, name: 'My Project' });

    const report = await getSpaceReport(env, space.id);
    const structure = report.sections.find((s) => s.heading.startsWith('Structure'));
    expect(structure.heading).toBe('Structure (2 entries)');
    expect(structure.lines).toContain('2 text');
    expect(structure.lines).toContain('Workspaces: My Workspace');
    expect(structure.lines).toContain('Projects: My Project');
  });

  it('includes a Work section only when Work items exist, with confidence breakdown', async () => {
    const space = await createSpace(env, { title: 'Has Work' });
    await createBlock(env, { spaceId: space.id, type: 'assessment', content: { statement: 'Claim', confidence: 'solid' } });
    const report = await getSpaceReport(env, space.id);
    const work = report.sections.find((s) => s.heading.startsWith('Work'));
    expect(work.heading).toBe('Work (1 item)');
    expect(work.lines).toContain('1 at "solid" confidence');
  });

  it('omits the Work section for a Space with no Work items', async () => {
    const space = await createSpace(env, { title: 'No Work' });
    const report = await getSpaceReport(env, space.id);
    expect(report.sections.map((s) => s.heading)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^Work/)])
    );
  });

  it('includes Milestones and Sessions sections only when those blocks exist', async () => {
    const space = await createSpace(env, { title: 'Has Time blocks' });
    await createBlock(env, { spaceId: space.id, type: 'milestone', content: { label: 'M', targetDate: null, reached: false, reachedAt: null, note: null } });
    await createBlock(env, { spaceId: space.id, type: 'session', content: { label: 'S', startedAt: 'x', endedAt: 'y', durationMinutes: 20, note: null } });

    const report = await getSpaceReport(env, space.id);
    expect(report.sections.find((s) => s.heading.startsWith('Milestones')).heading).toBe('Milestones (0/1 reached)');
    expect(report.sections.find((s) => s.heading.startsWith('Sessions')).heading).toBe('Sessions (1, 20 min logged)');
  });

  it('includes a Relational section listing both outgoing References and incoming backlinks', async () => {
    const target = await createSpace(env, { title: 'Target' });
    const source = await createSpace(env, { title: 'Source' });
    await addBlockToSpace(env, source.id, { type: 'reference', content: { target_space_id: target.id, note: 'why' } });

    const targetReport = await getSpaceReport(env, target.id);
    const relational = targetReport.sections.find((s) => s.heading === 'Relational');
    expect(relational.lines).toEqual(['<- Source (why)']);
  });

  it('includes a Recent Trail section with at most the last 5 entries, most recent first', async () => {
    const space = await createSpace(env, { title: 'Has Trail' });
    for (let i = 0; i < 7; i += 1) {
      await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: `entry ${i}` });
    }
    const report = await getSpaceReport(env, space.id);
    const trailSection = report.sections.find((s) => s.heading === 'Recent Trail');
    expect(trailSection.lines).toHaveLength(5);
    expect(trailSection.lines[0]).toContain('entry 6'); // most recent first
  });
});
