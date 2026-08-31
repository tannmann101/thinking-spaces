import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { getSkeletonSnapshot } from './skeleton.js';

// NOTE on the trail.js <-> skeleton.js circular import: see the matching
// note at the top of skeleton.js. logTrailEntry below needs
// getSkeletonSnapshot to take its snapshot; several Skeleton-editing
// functions need logTrailEntry to record what just changed. The
// reference here is inside a function body (called lazily at runtime),
// so the circular import is safe under Node's ESM module system.

// --- Trail --------------------------------------------------------
// The history layer. Every entry snapshots the Skeleton's full state
// at that moment (all four lanes' items + the articulation text)
// rather than a diff -- simpler, and this app's data volumes make the
// extra storage a non-issue. "auto" entries log themselves (see
// skeleton.js's saveTextBlockWithPromotion); "manual" ones are the
// person adding a narrative "why" directly. "review" is the Time arc's
// third kind -- see review.js's getReviewDraft/createReview.

// Exported (not just used internally) since dashboard.js's
// listRecentTrailEntries also needs to parse a trail_entries row the
// same way.
export function parseTrailRow(row) {
  return { ...row, skeleton_snapshot: JSON.parse(row.skeleton_snapshot) };
}

export function logTrailEntry({ spaceId, kind, summary, note = null }) {
  const id = randomUUID();
  const snapshot = getSkeletonSnapshot(spaceId);
  db.prepare(
    `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, spaceId, kind, summary, note, JSON.stringify(snapshot));
  return parseTrailRow(db.prepare(`SELECT * FROM trail_entries WHERE id = ?`).get(id));
}

function truncateForSummary(text) {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export function addManualTrailEntry(spaceId, note) {
  return logTrailEntry({ spaceId, kind: 'manual', summary: truncateForSummary(note), note });
}

export function listTrailEntries(spaceId) {
  const rows = db
    .prepare(`SELECT * FROM trail_entries WHERE space_id = ? ORDER BY created_at ASC`)
    .all(spaceId);
  return rows.map(parseTrailRow);
}

// Entries used to be write-once -- an auto entry that wrote itself
// (e.g. "Promoted: 2 Premises") had no way to get a manual "why"
// attached afterward, and a manual note had no way to fix a typo once
// saved. This is the one function both go through. For a manual entry,
// note *is* its own text, so its summary (the truncated preview the
// Log page shows) is recomputed to match; an auto entry's summary is
// left alone, since a note added here is a "why" layered on top of
// what already wrote itself, not a replacement for it.
export function updateTrailEntry(id, note) {
  const existing = db.prepare(`SELECT * FROM trail_entries WHERE id = ?`).get(id);
  if (!existing) return null;
  const summary = existing.kind === 'manual' ? truncateForSummary(note) : existing.summary;
  db.prepare(`UPDATE trail_entries SET note = ?, summary = ? WHERE id = ?`).run(note, summary, id);
  return parseTrailRow(db.prepare(`SELECT * FROM trail_entries WHERE id = ?`).get(id));
}
