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
// getWeekCalendar also needs to parse a trail_entries row the same way.
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
  const entry = logTrailEntry({ spaceId, kind: 'manual', summary: truncateForSummary(note), note });
  return { ...entry, changeSummary: 'Trail note added' };
}

export function listTrailEntries(spaceId) {
  const rows = db
    .prepare(`SELECT * FROM trail_entries WHERE space_id = ? ORDER BY created_at ASC`)
    .all(spaceId);
  return rows.map(parseTrailRow);
}

// A Space's own full history: its Trail entries *and* the activity
// recorded against it, in one chronological list.
//
// listGlobalActivity (log.js) already merges Trail into the Log; this
// is the missing mirror. It exists because Trail on its own was empty
// on essentially every real Space -- an auto entry only ever wrote
// itself on a Skeleton edit, so unless the person used the promotion
// shorthand, a Space had no recorded history at all, while
// activity_log had been quietly recording that Space's real events the
// whole time.
//
// Every row carries `source`, because the two kinds are genuinely
// different and the page must not pretend otherwise: a 'trail' row has
// a Skeleton snapshot (so Rewind can reconstruct that moment) and an
// editable note; an 'activity' row is a recorded fact with neither.
// Merged in JS rather than SQL because a trail row needs its snapshot
// parsed and an activity row has no snapshot column to select -- a
// UNION would mean inventing null columns on both sides to line them
// up, which reads worse than two small reads and a sort.
export function listSpaceHistory(spaceId) {
  const trail = listTrailEntries(spaceId).map((entry) => ({ ...entry, source: 'trail' }));

  // An activity summary is written for the Log, where a row has to say
  // which Space it belongs to ("Added a text entry to \"Foo\""). On that
  // Space's own page every row is about this Space already, so the name
  // is pure repetition on every single line -- exactly the noise that
  // makes a history hard to read. Stripped here rather than stored
  // twice: this is an exact match against the Space's own known title,
  // not a guess at the shape of arbitrary prose, and it leaves the
  // stored summary (which the Log still needs in full) untouched.
  const space = db.prepare(`SELECT title FROM spaces WHERE id = ?`).get(spaceId);
  const withoutSpaceName = (summary) => {
    if (!space?.title) return summary;
    const title = space.title;
    return summary
      .replace(` in "${title}"`, '')
      .replace(` to "${title}"`, '')
      .replace(` from "${title}"`, '')
      .replace(`"${title}": `, '')
      .replace(`"${title}" `, '')
      .replace(`"${title}"`, 'this Space');
  };
  // Stripping a leading `"Title" ` can leave a sentence starting
  // mid-word ("status changed to mature"), so the first letter is
  // restored -- a small thing, but every row on the page reads through
  // it.
  const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

  const activity = db
    .prepare(
      `SELECT id, kind, summary, block_id, event_count, created_at
         FROM activity_log
        WHERE space_id = ?
        ORDER BY created_at ASC`
    )
    .all(spaceId)
    .map((row) => ({ ...row, summary: sentence(withoutSpaceName(row.summary)), source: 'activity' }));

  // Oldest first, matching listTrailEntries' own order (TrailSpine
  // reads a Space's history as a narrative, unlike the Log page's
  // newest-first feed). created_at has second granularity, so a tie is
  // possible -- Trail entries sort first within one second, since a
  // Trail entry is written *after* the change it describes.
  return [...activity, ...trail].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    if (a.source === b.source) return 0;
    return a.source === 'activity' ? -1 : 1;
  });
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
