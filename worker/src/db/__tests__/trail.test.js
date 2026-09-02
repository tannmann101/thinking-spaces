import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { parseTrailRow, logTrailEntry, addManualTrailEntry, listTrailEntries, updateTrailEntry } from '../trail.js';
import { createSpace } from '../spaces.js';
import { createBlock } from '../blocks.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

describe('trail.js', () => {
  let space;
  beforeEach(async () => {
    await resetDb(env);
    space = await createSpace(env, { title: 'A Space' });
  });

  describe('logTrailEntry', () => {
    it('stores a full Skeleton snapshot alongside the entry', async () => {
      await createBlock(env, {
        spaceId: space.id,
        type: 'list',
        content: { items: [{ id: '1', text: 'a premise' }], laneLabel: 'Premises' },
        properties: { skeletonLane: 'premises' },
      });
      const entry = await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'Something happened' });
      expect(entry.kind).toBe('auto');
      expect(entry.skeleton_snapshot.lanes.premises.items[0].text).toBe('a premise');
    });
  });

  describe('addManualTrailEntry', () => {
    it('truncates a long note into the summary, keeping the full note', async () => {
      const longNote = 'x'.repeat(100);
      const entry = await addManualTrailEntry(env, space.id, longNote);
      expect(entry.note).toBe(longNote);
      expect(entry.summary).toHaveLength(60);
      expect(entry.summary.endsWith('...')).toBe(true);
    });

    it('leaves a short note as its own summary, unchanged', async () => {
      const entry = await addManualTrailEntry(env, space.id, 'short note');
      expect(entry.summary).toBe('short note');
    });
  });

  describe('listTrailEntries', () => {
    it('returns entries oldest first, scoped to the given Space', async () => {
      const other = await createSpace(env, { title: 'Other' });
      await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'first' });
      await logTrailEntry(env, { spaceId: other.id, kind: 'auto', summary: 'not mine' });
      await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'second' });
      const entries = await listTrailEntries(env, space.id);
      expect(entries.map((e) => e.summary)).toEqual(['first', 'second']);
    });

    it('parses skeleton_snapshot back into an object, not a raw JSON string', async () => {
      await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'x' });
      const [entry] = await listTrailEntries(env, space.id);
      expect(typeof entry.skeleton_snapshot).toBe('object');
    });
  });

  describe('updateTrailEntry', () => {
    it('recomputes summary from the new note for a manual entry', async () => {
      const entry = await addManualTrailEntry(env, space.id, 'original note');
      const updated = await updateTrailEntry(env, entry.id, 'a completely different note');
      expect(updated.note).toBe('a completely different note');
      expect(updated.summary).toBe('a completely different note');
    });

    it('leaves an auto entry\'s own summary alone when a note is attached', async () => {
      const entry = await logTrailEntry(env, { spaceId: space.id, kind: 'auto', summary: 'Promoted: 1 Premises' });
      const updated = await updateTrailEntry(env, entry.id, 'why this happened');
      expect(updated.summary).toBe('Promoted: 1 Premises');
      expect(updated.note).toBe('why this happened');
    });

    it('leaves a review entry\'s own summary alone too, same as an auto entry', async () => {
      const entry = await logTrailEntry(env, { spaceId: space.id, kind: 'review', summary: 'Review: 3 blocks added' });
      const updated = await updateTrailEntry(env, entry.id, 'context for this review');
      expect(updated.summary).toBe('Review: 3 blocks added');
    });

    it('returns null for a nonexistent entry', async () => {
      expect(await updateTrailEntry(env, 'nonexistent', 'note')).toBeNull();
    });
  });

  describe('parseTrailRow', () => {
    it('parses the raw skeleton_snapshot JSON column', async () => {
      await env.DB.prepare(
        `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind('raw-1', space.id, 'manual', 'x', 'x', JSON.stringify({ lanes: {}, articulation: 'y' }))
        .run();
      const row = await env.DB.prepare('SELECT * FROM trail_entries WHERE id = ?').bind('raw-1').first();
      expect(parseTrailRow(row).skeleton_snapshot).toEqual({ lanes: {}, articulation: 'y' });
    });
  });
});
