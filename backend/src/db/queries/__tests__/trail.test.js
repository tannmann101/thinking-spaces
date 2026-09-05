import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import {
  parseTrailRow,
  logTrailEntry,
  addManualTrailEntry,
  listTrailEntries,
  listSpaceHistory,
  updateTrailEntry,
} from '../trail.js';
import { createSpace, updateSpace } from '../spaces.js';
import { createBlock, addBlockToSpace } from '../blocks.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

describe('trail.js', () => {
  let space;
  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  describe('logTrailEntry', () => {
    it('stores a full Skeleton snapshot alongside the entry', () => {
      createBlock({
        spaceId: space.id,
        type: 'list',
        content: { items: [{ id: '1', text: 'a premise' }], laneLabel: 'Premises' },
        properties: { skeletonLane: 'premises' },
      });
      const entry = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'Something happened' });
      expect(entry.kind).toBe('auto');
      expect(entry.skeleton_snapshot.lanes.premises.items[0].text).toBe('a premise');
    });
  });

  describe('addManualTrailEntry', () => {
    it('truncates a long note into the summary, keeping the full note', () => {
      const longNote = 'x'.repeat(100);
      const entry = addManualTrailEntry(space.id, longNote);
      expect(entry.note).toBe(longNote);
      expect(entry.summary).toHaveLength(60);
      expect(entry.summary.endsWith('...')).toBe(true);
    });

    it('leaves a short note as its own summary, unchanged', () => {
      const entry = addManualTrailEntry(space.id, 'short note');
      expect(entry.summary).toBe('short note');
    });
  });

  describe('listTrailEntries', () => {
    it('returns entries oldest first, scoped to the given Space', () => {
      const other = createSpace({ title: 'Other' });
      logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'first' });
      logTrailEntry({ spaceId: other.id, kind: 'auto', summary: 'not mine' });
      logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'second' });
      const entries = listTrailEntries(space.id);
      expect(entries.map((e) => e.summary)).toEqual(['first', 'second']);
    });

    it('parses skeleton_snapshot back into an object, not a raw JSON string', () => {
      logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'x' });
      const [entry] = listTrailEntries(space.id);
      expect(typeof entry.skeleton_snapshot).toBe('object');
    });
  });

  describe('updateTrailEntry', () => {
    it('recomputes summary from the new note for a manual entry', () => {
      const entry = addManualTrailEntry(space.id, 'original note');
      const updated = updateTrailEntry(entry.id, 'a completely different note');
      expect(updated.note).toBe('a completely different note');
      expect(updated.summary).toBe('a completely different note');
    });

    it('leaves an auto entry\'s own summary alone when a note is attached', () => {
      const entry = logTrailEntry({ spaceId: space.id, kind: 'auto', summary: 'Promoted: 1 Premises' });
      const updated = updateTrailEntry(entry.id, 'why this happened');
      expect(updated.summary).toBe('Promoted: 1 Premises');
      expect(updated.note).toBe('why this happened');
    });

    it('leaves a review entry\'s own summary alone too, same as an auto entry', () => {
      const entry = logTrailEntry({ spaceId: space.id, kind: 'review', summary: 'Review: 3 blocks added' });
      const updated = updateTrailEntry(entry.id, 'context for this review');
      expect(updated.summary).toBe('Review: 3 blocks added');
    });

    it('returns null for a nonexistent entry', () => {
      expect(updateTrailEntry('nonexistent', 'note')).toBeNull();
    });
  });

  describe('parseTrailRow', () => {
    it('parses the raw skeleton_snapshot JSON column', () => {
      db.prepare(
        `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('raw-1', space.id, 'manual', 'x', 'x', JSON.stringify({ lanes: {}, articulation: 'y' }));
      const row = db.prepare('SELECT * FROM trail_entries WHERE id = ?').get('raw-1');
      expect(parseTrailRow(row).skeleton_snapshot).toEqual({ lanes: {}, articulation: 'y' });
    });
  });
});

// The mirror of what listGlobalActivity already does for the Log:
// a Space's own recorded activity shown alongside its Trail entries.
describe('listSpaceHistory', () => {
  let space;

  beforeEach(() => {
    resetDb();
    space = createSpace({ title: 'A Space' });
  });

  it("returns a Space's activity alongside its Trail entries, oldest first", () => {
    addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    addManualTrailEntry(space.id, 'why this matters');

    const history = listSpaceHistory(space.id);
    expect(history.map((row) => row.source)).toEqual(['activity', 'activity', 'trail']);
    expect(history.at(-1).note).toBe('why this matters');
  });

  it('marks which rows can actually be rewound to', () => {
    addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    addManualTrailEntry(space.id, 'a note');

    // Only a Trail row carries a snapshot -- an activity row must not
    // claim one, or the page would offer a Rewind it can't fulfil.
    listSpaceHistory(space.id).forEach((row) => {
      expect(Boolean(row.skeleton_snapshot)).toBe(row.source === 'trail');
    });
  });

  it("drops the Space's own name from summaries, since every row is about this Space", () => {
    addBlockToSpace(space.id, { type: 'text', content: { lines: [] } });
    updateSpace(space.id, { status: 'mature' });

    const summaries = listSpaceHistory(space.id).map((row) => row.summary);
    expect(summaries).toContain('Added a text entry');
    expect(summaries).toContain('Status changed to mature');
    summaries.forEach((summary) => expect(summary).not.toContain('A Space'));
  });

  it("leaves another Space's activity out of it", () => {
    const other = createSpace({ title: 'Other Space' });
    addBlockToSpace(other.id, { type: 'text', content: { lines: [] } });

    expect(listSpaceHistory(space.id).some((row) => row.summary.includes('text entry'))).toBe(false);
  });

  it('returns an empty history for a Space that does not exist', () => {
    expect(listSpaceHistory('nonexistent')).toEqual([]);
  });
});
