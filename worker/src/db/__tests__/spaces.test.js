import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  listSpaces,
  listSpacesByTag,
  getSpaceById,
  createSpace,
  updateSpace,
  deleteSpace,
  createSpaceWithSetup,
  ensureTestSpaceExists,
  createRelationalSpace,
  listResourcesIndex,
  listSynthesesIndex,
} from '../spaces.js';
import { createWorkspace } from '../workspaces.js';
import { createProject, getProjectById } from '../projects.js';
import { addBlockToSpace, listBlocksForSpace } from '../blocks.js';
import { createTemplate } from '../templates.js';
import { TEST_SPACE_ID } from '../constants.js';
import { createBlock, updateBlockContent, updateBlockProject } from '../blocks.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('createSpace / getSpaceById', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates a Space with sensible defaults', async () => {
    const space = await createSpace(env, { title: 'A new train of thought' });
    expect(space).toMatchObject({
      title: 'A new train of thought',
      status: 'active',
      tags: [],
      categories: [],
      origin: null,
      isTestSpace: false,
      relationDensity: 0,
      openTensionCount: 0,
      isOverdue: false,
      milestoneStats: { reached: 0, total: 0 },
    });
  });

  it('attaches a changeSummary naming the new Space, for the toast (see Toast.jsx)', async () => {
    const space = await createSpace(env, { title: 'A new train of thought' });
    expect(space.changeSummary).toBe('Created "A new train of thought"');
  });

  it('accepts a fixed id, tags, categories, origin, and dueDate at creation', async () => {
    const space = await createSpace(env, {
      id: 'fixed-id',
      title: 'Resource demo',
      tags: ['resource', 'book'],
      categories: ['What It Is'],
      origin: 'external',
      dueDate: '2020-01-01',
    });
    expect(space.id).toBe('fixed-id');
    expect(space.tags).toEqual(['resource', 'book']);
    expect(space.categories).toEqual(['What It Is']);
    expect(space.origin).toBe('external');
    // A due date in the past makes it overdue immediately, independent
    // of status -- same reasoning Insights' staleness check uses.
    expect(space.isOverdue).toBe(true);
  });

  it('flags the Test Space specifically by its fixed id', async () => {
    const space = await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    expect(space.isTestSpace).toBe(true);
  });

  it('logs a space_created activity entry', async () => {
    await createSpace(env, { title: 'Logged' });
    const { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'space_created'`).all();
    expect(results).toHaveLength(1);
  });

  it('getSpaceById returns null for a nonexistent id', async () => {
    expect(await getSpaceById(env, 'nonexistent')).toBeNull();
  });
});

describe('relationDensity / openTensionCount', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('counts both outgoing and incoming references', async () => {
    const a = await createSpace(env, { title: 'A' });
    const b = await createSpace(env, { title: 'B' });
    await addBlockToSpace(env, a.id, { type: 'reference', content: { target_space_id: b.id } });
    expect((await getSpaceById(env, a.id)).relationDensity).toBe(1); // one outgoing
    expect((await getSpaceById(env, b.id)).relationDensity).toBe(1); // one incoming
  });

  it('counts items in the Tensions skeleton lane as open', async () => {
    const space = await createSpace(env, { title: 'Has tensions' });
    await addBlockToSpace(env, space.id, {
      type: 'list',
      content: { items: [{ id: '1', text: 'x' }, { id: '2', text: 'y' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    expect((await getSpaceById(env, space.id)).openTensionCount).toBe(2);
  });
});

describe('milestoneStats', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('counts reached and total Milestones separately', async () => {
    const space = await createSpace(env, { title: 'Has Milestones' });
    await addBlockToSpace(env, space.id, { type: 'milestone', content: { label: 'A', reached: true } });
    await addBlockToSpace(env, space.id, { type: 'milestone', content: { label: 'B', reached: false } });
    await addBlockToSpace(env, space.id, { type: 'milestone', content: { label: 'C', reached: true } });
    expect((await getSpaceById(env, space.id)).milestoneStats).toEqual({ reached: 2, total: 3 });
  });

  it('reports zero of zero for a Space with no Milestones', async () => {
    const space = await createSpace(env, { title: 'No Milestones' });
    expect((await getSpaceById(env, space.id)).milestoneStats).toEqual({ reached: 0, total: 0 });
  });
});

describe('listSpaces / listSpacesByTag', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('lists every Space, most recently updated first', async () => {
    const older = await createSpace(env, { title: 'Older' });
    const newer = await createSpace(env, { title: 'Newer' });
    // Force a real ordering difference rather than relying on
    // datetime('now')'s one-second granularity across two calls that
    // could otherwise land in the same second.
    await env.DB.prepare(`UPDATE spaces SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).bind(older.id).run();
    await env.DB.prepare(`UPDATE spaces SET updated_at = '2099-01-01 00:00:00' WHERE id = ?`).bind(newer.id).run();
    const titles = (await listSpaces(env)).map((s) => s.title);
    expect(titles[0]).toBe('Newer');
  });

  it('filters by tag membership, excluding the Test Space', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', tags: ['resource'] });
    await createSpace(env, { title: 'A real Resource', tags: ['resource'] });
    await createSpace(env, { title: 'Not a Resource', tags: [] });
    const resources = await listSpacesByTag(env, 'resource');
    expect(resources).toHaveLength(1);
    expect(resources[0].title).toBe('A real Resource');
  });
});

describe('updateSpace', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('updates only the given fields, leaving the rest untouched', async () => {
    // createSpace itself has no `goal` parameter -- a goal is always
    // set afterward through updateSpace, same as an ordinary Space's
    // "Working toward" field is edited from the Space page.
    const space = await createSpace(env, { title: 'Original', tags: ['a'] });
    await updateSpace(env, space.id, { goal: 'original goal' });
    const updated = await updateSpace(env, space.id, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.tags).toEqual(['a']);
    expect(updated.goal).toBe('original goal');
  });

  it('logs a status change but not a plain title/tag edit', async () => {
    const space = await createSpace(env, { title: 'X' });
    await updateSpace(env, space.id, { title: 'Y' });
    let { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all();
    expect(results).toHaveLength(0);

    await updateSpace(env, space.id, { status: 'mature' });
    ({ results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all());
    expect(results).toHaveLength(1);
  });

  it('does not log a status change when the status is set to its current value', async () => {
    const space = await createSpace(env, { title: 'X', status: 'mature' });
    await updateSpace(env, space.id, { status: 'mature' });
    const { results } = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all();
    expect(results).toHaveLength(0);
  });

  it('returns null for a nonexistent Space', async () => {
    expect(await updateSpace(env, 'nonexistent', { title: 'x' })).toBeNull();
  });

  it('round-trips a theme override as parsed JSON, and clears it back to the computed default with null', async () => {
    const space = await createSpace(env, { title: 'Themed' });
    expect(space.theme).toBeNull();

    const themed = await updateSpace(env, space.id, { theme: { accent: 'teal', shape: 'notch' } });
    expect(themed.theme).toEqual({ accent: 'teal', shape: 'notch' });
    expect((await getSpaceById(env, space.id)).theme).toEqual({ accent: 'teal', shape: 'notch' });

    expect((await updateSpace(env, space.id, { theme: null })).theme).toBeNull();
  });

  it('leaves an existing theme untouched when other fields are edited', async () => {
    const space = await createSpace(env, { title: 'Themed' });
    await updateSpace(env, space.id, { theme: { accent: 'gold' } });
    expect((await updateSpace(env, space.id, { title: 'Renamed' })).theme).toEqual({ accent: 'gold' });
  });

  it('attaches a changeSummary for a status change, but not for a plain title edit', async () => {
    const space = await createSpace(env, { title: 'X' });
    expect((await updateSpace(env, space.id, { title: 'Y' })).changeSummary).toBeUndefined();
    expect((await updateSpace(env, space.id, { status: 'mature' })).changeSummary).toBe('Status changed to mature');
  });

  it('attaches a changeSummary naming when a due date will show as overdue vs. upcoming', async () => {
    const space = await createSpace(env, { title: 'X' });
    expect((await updateSpace(env, space.id, { dueDate: '2020-01-01' })).changeSummary).toBe('Due 2020-01-01 -- already overdue');
    const space2 = await createSpace(env, { title: 'Y' });
    expect((await updateSpace(env, space2.id, { dueDate: '2099-01-01' })).changeSummary).toBe(
      'Due 2099-01-01 -- now shows on your Week digest'
    );
  });

  it('attaches "Due date cleared" as the changeSummary when a due date is unset', async () => {
    const space = await createSpace(env, { title: 'X', dueDate: '2099-01-01' });
    expect((await updateSpace(env, space.id, { dueDate: null })).changeSummary).toBe('Due date cleared');
  });

  it('can clear a field by passing an explicit falsy value', async () => {
    const space = await createSpace(env, { title: 'X', dueDate: '2099-01-01' });
    const updated = await updateSpace(env, space.id, { dueDate: null });
    expect(updated.due_date).toBeNull();
  });
});

describe('deleteSpace', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('refuses to delete the Test Space', async () => {
    await createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space' });
    await expect(deleteSpace(env, TEST_SPACE_ID)).rejects.toThrow('The Test Space cannot be deleted');
  });

  it('deletes the Space, its blocks, and its trail entries', async () => {
    const space = await createSpace(env, { title: 'Doomed' });
    await addBlockToSpace(env, space.id, { type: 'text', content: {} });
    await env.DB.prepare(
      `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('trail-1', space.id, 'manual', 'a note', 'a note', '{}')
      .run();

    await deleteSpace(env, space.id);

    expect(await getSpaceById(env, space.id)).toBeNull();
    expect((await env.DB.prepare('SELECT * FROM blocks WHERE space_id = ?').bind(space.id).all()).results).toEqual([]);
    expect((await env.DB.prepare('SELECT * FROM trail_entries WHERE space_id = ?').bind(space.id).all()).results).toEqual([]);
  });

  it('logs a space_deleted activity entry with a snapshotted title', async () => {
    const space = await createSpace(env, { title: 'Named before deletion' });
    await deleteSpace(env, space.id);
    const logged = await env.DB.prepare(`SELECT * FROM activity_log WHERE kind = 'space_deleted'`).first();
    expect(logged.space_title).toBe('Named before deletion');
    expect(logged.space_id).toBeNull();
  });

  it('also deletes a Space\'s own Workspaces, so a Space that ever had one can still be deleted', async () => {
    // Regression test for a real bug this test suite caught directly:
    // deleteSpace used to delete blocks and trail_entries but never a
    // Space's own workspaces rows, so the DELETE FROM spaces below
    // would fail its foreign key constraint (workspaces.space_id
    // references spaces(id)) for any Space that ever had a Workspace --
    // flagged twice in CLAUDE.md's Open section before this fixed it.
    const space = await createSpace(env, { title: 'Has a Workspace' });
    await createWorkspace(env, { spaceId: space.id, name: 'A Workspace' });

    await expect(deleteSpace(env, space.id)).resolves.not.toThrow();
    expect(await getSpaceById(env, space.id)).toBeNull();
    expect((await env.DB.prepare('SELECT * FROM workspaces WHERE space_id = ?').bind(space.id).all()).results).toEqual([]);
  });

  // A Project no longer belongs to a Space, so deleting a Space must
  // leave the Project standing -- other Spaces may still feed it.
  it('leaves a Project standing when a Space its work lived in is deleted', async () => {
    const space = await createSpace(env, { title: 'Has work on a Project' });
    const project = await createProject(env, { name: 'A Project' });
    const block = await createBlock(env, { spaceId: space.id, type: 'milestone', content: {} });
    await updateBlockProject(env, block.id, project.id);

    await deleteSpace(env, space.id);
    expect(await getSpaceById(env, space.id)).toBeNull();
    expect(await getProjectById(env, project.id)).toBeTruthy();
  });
});

describe('createSpaceWithSetup', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('applies a Template\'s starting blocks', async () => {
    const template = await createTemplate(env, { name: 'T', blockArrangement: [{ type: 'text', content: { text: 'starter' } }] });
    const space = await createSpaceWithSetup(env, { title: 'From template', templateId: template.id });
    expect(await listBlocksForSpace(env, space.id)).toHaveLength(1);
  });

  it('carries createSpace\'s own changeSummary through, not the setup steps\' own summaries', async () => {
    const space = await createSpaceWithSetup(env, {
      title: 'With extras',
      extraBlocks: [{ type: 'list', content: { items: [] } }],
    });
    expect(space.changeSummary).toBe('Created "With extras"');
  });

  it('adds extraBlocks on top of the Template', async () => {
    const space = await createSpaceWithSetup(env, {
      title: 'With extras',
      extraBlocks: [{ type: 'list', content: { items: [] } }],
    });
    expect((await listBlocksForSpace(env, space.id)).map((b) => b.type)).toEqual(['list']);
  });

  it('adds one Reference block per resourceSpaceId', async () => {
    const resource = await createSpace(env, { title: 'A Resource' });
    const space = await createSpaceWithSetup(env, { title: 'Pulls in a Resource', resourceSpaceIds: [resource.id] });
    const [block] = await listBlocksForSpace(env, space.id);
    expect(block.type).toBe('reference');
    expect(block.content.target_space_id).toBe(resource.id);
  });

  it('sets the goal after creation via updateSpace', async () => {
    const space = await createSpaceWithSetup(env, { title: 'Has a goal', goal: 'Ship it' });
    expect((await getSpaceById(env, space.id)).goal).toBe('Ship it');
  });

  it('creates named Workspaces and resolves properties.workspaceNames into real workspace ids', async () => {
    const space = await createSpaceWithSetup(env, {
      title: 'With Workspaces',
      workspaces: ['Focus Area'],
      extraBlocks: [{ type: 'text', content: { text: 'x' }, properties: { workspaceNames: ['Focus Area'] } }],
    });
    const [block] = await listBlocksForSpace(env, space.id);
    const { results: workspaceRows } = await env.DB.prepare('SELECT * FROM workspaces WHERE space_id = ?').bind(space.id).all();
    const [workspace] = workspaceRows;
    expect(block.properties.workspaces).toEqual([workspace.id]);
    // The draft-time name itself must not leak into the stored properties.
    expect(block.properties.workspaceNames).toBeUndefined();
  });

  it('leaves properties untouched when no workspaceNames are given', async () => {
    const space = await createSpaceWithSetup(env, {
      title: 'No workspace filing',
      extraBlocks: [{ type: 'text', content: { text: 'x' }, properties: { categories: ['Cat'] } }],
    });
    const [block] = await listBlocksForSpace(env, space.id);
    expect(block.properties.categories).toEqual(['Cat']);
    expect(block.properties.workspaces).toBeUndefined();
  });
});

describe('ensureTestSpaceExists', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates the Test Space the first time', async () => {
    const space = await ensureTestSpaceExists(env);
    expect(space.id).toBe(TEST_SPACE_ID);
    expect(space.status).toBe('active');
  });

  it('is idempotent: a second call returns the same Space without erroring', async () => {
    const first = await ensureTestSpaceExists(env);
    const second = await ensureTestSpaceExists(env);
    expect(second.id).toBe(first.id);
    expect((await listSpaces(env)).filter((s) => s.id === TEST_SPACE_ID)).toHaveLength(1);
  });
});

describe('createRelationalSpace', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('creates a Space tagged "relational" with a Reference to each selected Space and one blank Text block', async () => {
    const a = await createSpace(env, { title: 'A' });
    const b = await createSpace(env, { title: 'B' });
    const relational = await createRelationalSpace(env, { title: 'Connecting A and B', spaceIds: [a.id, b.id] });

    expect(relational.tags).toEqual(['relational']);
    const blocks = await listBlocksForSpace(env, relational.id);
    expect(blocks.filter((block) => block.type === 'text')).toHaveLength(1);
    const referenceTargets = blocks.filter((block) => block.type === 'reference').map((block) => block.content.target_space_id);
    expect(referenceTargets.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('listResourcesIndex', async () => {
  beforeEach(async () => { await resetDb(env); });

  it('returns nothing when there are no Resources', async () => {
    expect(await listResourcesIndex(env)).toEqual([]);
  });

  it('separates the type tags from the structural "resource" tag', async () => {
    await createSpace(env, { title: 'A Book', tags: ['resource', 'book'] });
    const [resource] = await listResourcesIndex(env);
    expect(resource.typeTags).toEqual(['book']);
  });

  it('reports a Resource nothing references -- the reading this page exists for', async () => {
    await createSpace(env, { title: 'Unused', tags: ['resource'] });
    const [resource] = await listResourcesIndex(env);
    expect(resource.referenceCount).toBe(0);
    expect(resource.referencedBy).toEqual([]);
  });

  it('names which Spaces reference a Resource', async () => {
    const resource = await createSpace(env, { title: 'A Book', tags: ['resource'] });
    const user = await createSpace(env, { title: 'Using Space' });
    await createBlock(env, {
      spaceId: user.id,
      type: 'reference',
      content: { target_space_id: resource.id },
      position: 0,
    });
    const [indexed] = await listResourcesIndex(env);
    expect(indexed.referenceCount).toBe(1);
    expect(indexed.referencedBy[0].spaceTitle).toBe('Using Space');
  });

  it('counts a Space once even when it references the Resource twice', async () => {
    const resource = await createSpace(env, { title: 'A Book', tags: ['resource'] });
    const user = await createSpace(env, { title: 'Using Space' });
    for (const position of [0, 1]) {
      await createBlock(env, {
        spaceId: user.id,
        type: 'reference',
        content: { target_space_id: resource.id },
        position,
      });
    }
    expect((await listResourcesIndex(env))[0].referenceCount).toBe(1);
  });
});

describe('listSynthesesIndex', async () => {
  beforeEach(async () => { await resetDb(env); });

  it('returns nothing when there are no Syntheses', async () => {
    expect(await listSynthesesIndex(env)).toEqual([]);
  });

  it('reads the kind from the tag alongside "synthesis", and not "resource"', async () => {
    await createSpace(env, { title: 'An Essay', tags: ['synthesis', 'essay', 'resource'] });
    const [synthesis] = await listSynthesesIndex(env);
    expect(synthesis.kinds).toEqual(['essay']);
    expect(synthesis.promoted).toBe(true);
  });

  it('reads an unpromoted Synthesis as not promoted', async () => {
    await createSpace(env, { title: 'A Draft', tags: ['synthesis'] });
    expect((await listSynthesesIndex(env))[0].promoted).toBe(false);
  });

  it('resolves lineage forward to the real Work items and their Spaces', async () => {
    const source = await createSpace(env, { title: 'Source Space' });
    const item = await createBlock(env, {
      spaceId: source.id,
      type: 'assessment',
      content: { statement: 'A claim', support: [], confidence: 'solid' },
      position: 0,
    });
    const synthesis = await createSpace(env, { title: 'The Piece', tags: ['synthesis'] });
    await createBlock(env, {
      spaceId: synthesis.id,
      type: 'text',
      content: { lines: [] },
      properties: { sourceItemIds: [item.id] },
      position: 0,
    });

    const [indexed] = await listSynthesesIndex(env);
    expect(indexed.drawnFrom).toHaveLength(1);
    expect(indexed.drawnFrom[0]).toMatchObject({
      type: 'assessment',
      statement: 'A claim',
      spaceTitle: 'Source Space',
    });
    expect(indexed.sourceSpaceCount).toBe(1);
  });

  it('shows a source claim as it reads now, not as it read when compiled', async () => {
    const source = await createSpace(env, { title: 'Source Space' });
    const item = await createBlock(env, {
      spaceId: source.id,
      type: 'assessment',
      content: { statement: 'Original wording', support: [], confidence: 'solid' },
      position: 0,
    });
    const synthesis = await createSpace(env, { title: 'The Piece', tags: ['synthesis'] });
    await createBlock(env, {
      spaceId: synthesis.id,
      type: 'text',
      content: { lines: [] },
      properties: { sourceItemIds: [item.id] },
      position: 0,
    });
    await updateBlockContent(env, item.id, { statement: 'Edited wording', support: [], confidence: 'solid' });

    expect((await listSynthesesIndex(env))[0].drawnFrom[0].statement).toBe('Edited wording');
  });

  it('reports no recorded sources for a Synthesis made before lineage was tracked', async () => {
    await createSpace(env, { title: 'Old One', tags: ['synthesis'] });
    expect((await listSynthesesIndex(env))[0].drawnFrom).toEqual([]);
  });
});
