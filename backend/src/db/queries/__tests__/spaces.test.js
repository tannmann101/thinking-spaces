import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
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
} from '../spaces.js';
import { createWorkspace } from '../workspaces.js';
import { createProject } from '../projects.js';
import { addBlockToSpace, listBlocksForSpace } from '../blocks.js';
import { createTemplate } from '../templates.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('createSpace / getSpaceById', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates a Space with sensible defaults', () => {
    const space = createSpace({ title: 'A new train of thought' });
    expect(space).toMatchObject({
      title: 'A new train of thought',
      status: 'nascent',
      tags: [],
      categories: [],
      origin: null,
      isTestSpace: false,
      relationDensity: 0,
      openTensionCount: 0,
      isOverdue: false,
    });
  });

  it('accepts a fixed id, tags, categories, origin, and dueDate at creation', () => {
    const space = createSpace({
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

  it('flags the Test Space specifically by its fixed id', () => {
    const space = createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    expect(space.isTestSpace).toBe(true);
  });

  it('logs a space_created activity entry', () => {
    createSpace({ title: 'Logged' });
    const rows = db.prepare(`SELECT * FROM activity_log WHERE kind = 'space_created'`).all();
    expect(rows).toHaveLength(1);
  });

  it('getSpaceById returns undefined for a nonexistent id', () => {
    expect(getSpaceById('nonexistent')).toBeUndefined();
  });
});

describe('relationDensity / openTensionCount', () => {
  beforeEach(() => {
    resetDb();
  });

  it('counts both outgoing and incoming references', () => {
    const a = createSpace({ title: 'A' });
    const b = createSpace({ title: 'B' });
    addBlockToSpace(a.id, { type: 'reference', content: { target_space_id: b.id } });
    expect(getSpaceById(a.id).relationDensity).toBe(1); // one outgoing
    expect(getSpaceById(b.id).relationDensity).toBe(1); // one incoming
  });

  it('counts items in the Tensions skeleton lane as open', () => {
    const space = createSpace({ title: 'Has tensions' });
    addBlockToSpace(space.id, {
      type: 'list',
      content: { items: [{ id: '1', text: 'x' }, { id: '2', text: 'y' }], laneLabel: 'Tensions' },
      properties: { skeletonLane: 'tensions' },
    });
    expect(getSpaceById(space.id).openTensionCount).toBe(2);
  });
});

describe('listSpaces / listSpacesByTag', () => {
  beforeEach(() => {
    resetDb();
  });

  it('lists every Space, most recently updated first', () => {
    const older = createSpace({ title: 'Older' });
    const newer = createSpace({ title: 'Newer' });
    // Force a real ordering difference rather than relying on
    // datetime('now')'s one-second granularity across two calls that
    // could otherwise land in the same second.
    db.prepare(`UPDATE spaces SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE spaces SET updated_at = '2099-01-01 00:00:00' WHERE id = ?`).run(newer.id);
    const titles = listSpaces().map((s) => s.title);
    expect(titles[0]).toBe('Newer');
  });

  it('filters by tag membership, excluding the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space', tags: ['resource'] });
    createSpace({ title: 'A real Resource', tags: ['resource'] });
    createSpace({ title: 'Not a Resource', tags: [] });
    const resources = listSpacesByTag('resource');
    expect(resources).toHaveLength(1);
    expect(resources[0].title).toBe('A real Resource');
  });
});

describe('updateSpace', () => {
  beforeEach(() => {
    resetDb();
  });

  it('updates only the given fields, leaving the rest untouched', () => {
    // createSpace itself has no `goal` parameter -- a goal is always
    // set afterward through updateSpace, same as an ordinary Space's
    // "Working toward" field is edited from the Space page.
    const space = createSpace({ title: 'Original', tags: ['a'] });
    updateSpace(space.id, { goal: 'original goal' });
    const updated = updateSpace(space.id, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.tags).toEqual(['a']);
    expect(updated.goal).toBe('original goal');
  });

  it('logs a status change but not a plain title/tag edit', () => {
    const space = createSpace({ title: 'X' });
    updateSpace(space.id, { title: 'Y' });
    expect(db.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all()).toHaveLength(0);

    updateSpace(space.id, { status: 'developing' });
    expect(db.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all()).toHaveLength(1);
  });

  it('does not log a status change when the status is set to its current value', () => {
    const space = createSpace({ title: 'X', status: 'developing' });
    updateSpace(space.id, { status: 'developing' });
    expect(db.prepare(`SELECT * FROM activity_log WHERE kind = 'space_status_changed'`).all()).toHaveLength(0);
  });

  it('returns null for a nonexistent Space', () => {
    expect(updateSpace('nonexistent', { title: 'x' })).toBeNull();
  });

  it('can clear a field by passing an explicit falsy value', () => {
    const space = createSpace({ title: 'X', dueDate: '2099-01-01' });
    const updated = updateSpace(space.id, { dueDate: null });
    expect(updated.due_date).toBeNull();
  });
});

describe('deleteSpace', () => {
  beforeEach(() => {
    resetDb();
  });

  it('refuses to delete the Test Space', () => {
    createSpace({ id: TEST_SPACE_ID, title: 'Test Space' });
    expect(() => deleteSpace(TEST_SPACE_ID)).toThrow('The Test Space cannot be deleted');
  });

  it('deletes the Space, its blocks, and its trail entries', () => {
    const space = createSpace({ title: 'Doomed' });
    addBlockToSpace(space.id, { type: 'text', content: {} });
    db.prepare(
      `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('trail-1', space.id, 'manual', 'a note', 'a note', '{}');

    deleteSpace(space.id);

    expect(getSpaceById(space.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM blocks WHERE space_id = ?').all(space.id)).toEqual([]);
    expect(db.prepare('SELECT * FROM trail_entries WHERE space_id = ?').all(space.id)).toEqual([]);
  });

  it('logs a space_deleted activity entry with a snapshotted title', () => {
    const space = createSpace({ title: 'Named before deletion' });
    deleteSpace(space.id);
    const logged = db.prepare(`SELECT * FROM activity_log WHERE kind = 'space_deleted'`).get();
    expect(logged.space_title).toBe('Named before deletion');
    expect(logged.space_id).toBeNull();
  });

  it('also deletes a Space\'s own Workspaces, so a Space that ever had one can still be deleted', () => {
    // Regression test for a real bug this test suite caught directly:
    // deleteSpace used to delete blocks and trail_entries but never a
    // Space's own workspaces rows, so the DELETE FROM spaces below
    // would fail its foreign key constraint (workspaces.space_id
    // references spaces(id)) for any Space that ever had a Workspace --
    // flagged twice in CLAUDE.md's Open section before this fixed it.
    const space = createSpace({ title: 'Has a Workspace' });
    createWorkspace({ spaceId: space.id, name: 'A Workspace' });

    expect(() => deleteSpace(space.id)).not.toThrow();
    expect(getSpaceById(space.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM workspaces WHERE space_id = ?').all(space.id)).toEqual([]);
  });

  it('also deletes a Space\'s own Projects -- the same foreign-key gap Workspaces once had', () => {
    const space = createSpace({ title: 'Has a Project' });
    createProject({ spaceId: space.id, name: 'A Project' });

    expect(() => deleteSpace(space.id)).not.toThrow();
    expect(getSpaceById(space.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM projects WHERE space_id = ?').all(space.id)).toEqual([]);
  });
});

describe('createSpaceWithSetup', () => {
  beforeEach(() => {
    resetDb();
  });

  it('applies a Template\'s starting blocks', () => {
    const template = createTemplate({ name: 'T', blockArrangement: [{ type: 'text', content: { text: 'starter' } }] });
    const space = createSpaceWithSetup({ title: 'From template', templateId: template.id });
    expect(listBlocksForSpace(space.id)).toHaveLength(1);
  });

  it('adds extraBlocks on top of the Template', () => {
    const space = createSpaceWithSetup({
      title: 'With extras',
      extraBlocks: [{ type: 'list', content: { items: [] } }],
    });
    expect(listBlocksForSpace(space.id).map((b) => b.type)).toEqual(['list']);
  });

  it('adds one Reference block per resourceSpaceId', () => {
    const resource = createSpace({ title: 'A Resource' });
    const space = createSpaceWithSetup({ title: 'Pulls in a Resource', resourceSpaceIds: [resource.id] });
    const [block] = listBlocksForSpace(space.id);
    expect(block.type).toBe('reference');
    expect(block.content.target_space_id).toBe(resource.id);
  });

  it('sets the goal after creation via updateSpace', () => {
    const space = createSpaceWithSetup({ title: 'Has a goal', goal: 'Ship it' });
    expect(getSpaceById(space.id).goal).toBe('Ship it');
  });

  it('creates named Workspaces and resolves properties.workspaceNames into real workspace ids', () => {
    const space = createSpaceWithSetup({
      title: 'With Workspaces',
      workspaces: ['Focus Area'],
      extraBlocks: [{ type: 'text', content: { text: 'x' }, properties: { workspaceNames: ['Focus Area'] } }],
    });
    const [block] = listBlocksForSpace(space.id);
    const [workspace] = db.prepare('SELECT * FROM workspaces WHERE space_id = ?').all(space.id);
    expect(block.properties.workspaces).toEqual([workspace.id]);
    // The draft-time name itself must not leak into the stored properties.
    expect(block.properties.workspaceNames).toBeUndefined();
  });

  it('leaves properties untouched when no workspaceNames are given', () => {
    const space = createSpaceWithSetup({
      title: 'No workspace filing',
      extraBlocks: [{ type: 'text', content: { text: 'x' }, properties: { categories: ['Cat'] } }],
    });
    const [block] = listBlocksForSpace(space.id);
    expect(block.properties.categories).toEqual(['Cat']);
    expect(block.properties.workspaces).toBeUndefined();
  });
});

describe('ensureTestSpaceExists', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates the Test Space the first time', () => {
    const space = ensureTestSpaceExists();
    expect(space.id).toBe(TEST_SPACE_ID);
    expect(space.status).toBe('developing');
  });

  it('is idempotent: a second call returns the same Space without erroring', () => {
    const first = ensureTestSpaceExists();
    const second = ensureTestSpaceExists();
    expect(second.id).toBe(first.id);
    expect(listSpaces().filter((s) => s.id === TEST_SPACE_ID)).toHaveLength(1);
  });
});

describe('createRelationalSpace', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates a Space tagged "relational" with a Reference to each selected Space and one blank Text block', () => {
    const a = createSpace({ title: 'A' });
    const b = createSpace({ title: 'B' });
    const relational = createRelationalSpace({ title: 'Connecting A and B', spaceIds: [a.id, b.id] });

    expect(relational.tags).toEqual(['relational']);
    const blocks = listBlocksForSpace(relational.id);
    expect(blocks.filter((block) => block.type === 'text')).toHaveLength(1);
    const referenceTargets = blocks.filter((block) => block.type === 'reference').map((block) => block.content.target_space_id);
    expect(referenceTargets.sort()).toEqual([a.id, b.id].sort());
  });
});
