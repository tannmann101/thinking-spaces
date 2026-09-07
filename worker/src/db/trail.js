// --- Trail --------------------------------------------------------
// The history layer. Every entry snapshots the Skeleton's full state
// at that moment (all four lanes' items + the articulation text)
// rather than a diff -- simpler, and this app's data volumes make the
// extra storage a non-issue. "auto" entries log themselves (see
// skeleton.js's saveTextBlockWithPromotion); "manual" ones are the
// person adding a narrative "why" directly. "review" is the Time arc's
// third kind -- see review.js's getReviewDraft/createReview.
//
// NOTE on the trail.js <-> skeleton.js circular import: see the matching
// note at the top of skeleton.js. Safe under the Workers runtime's ESM
// module system for the same reason it's safe in Node -- every
// cross-reference here happens inside a function body, called lazily at
// request time, never at module-top-level evaluation.

import { getSkeletonSnapshot } from './skeleton.js';

// Exported (not just used internally) since dashboard.js's
// getWeekCalendar also needs to parse a trail_entries row the same way.
export function parseTrailRow(row) {
  return { ...row, skeleton_snapshot: JSON.parse(row.skeleton_snapshot) };
}

export async function logTrailEntry(env, { spaceId, kind, summary, note = null }) {
  const id = crypto.randomUUID();
  const snapshot = await getSkeletonSnapshot(env, spaceId);
  await env.DB.prepare(
    `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, spaceId, kind, summary, note, JSON.stringify(snapshot))
    .run();
  const row = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  return parseTrailRow(row);
}

function truncateForSummary(text) {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export async function addManualTrailEntry(env, spaceId, note) {
  const entry = await logTrailEntry(env, { spaceId, kind: 'manual', summary: truncateForSummary(note), note });
  return { ...entry, changeSummary: 'Trail note added' };
}

export async function listTrailEntries(env, spaceId) {
  const { results } = await env.DB.prepare(`SELECT * FROM trail_entries WHERE space_id = ? ORDER BY created_at ASC`)
    .bind(spaceId)
    .all();
  return results.map(parseTrailRow);
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
export async function listSpaceHistory(env, spaceId) {
  const trail = (await listTrailEntries(env, spaceId)).map((entry) => ({ ...entry, source: 'trail' }));

  // The Space's own name is stripped from each summary -- see the
  // comment above listSpaceHistory for why.
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(spaceId).first();
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
  const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

  // A Space's own construction is left out here: "Created this Space"
  // followed by "Added a writing entry" for each starter is the record
  // of building the page, not of thinking in it, and on a templated
  // Space it is the *entire* history until you write something. The Log
  // still has all of it -- that view is about what happened across every
  // Space, where a Space appearing genuinely is an event.
  //
  // Scoped to exactly what the creation request itself wrote: the
  // `space_created` row, plus any entry logged in the same second as it.
  // A Template's starters are inserted synchronously right after the
  // Space, so they share its datetime('now') to the second (the same
  // property getReviewDraft had to widen its own comparison for). An
  // entry you add a few seconds later is real work and stays.
  //
  // The one imprecision, stated rather than hidden: a creation request
  // that happens to straddle a second boundary leaves one starter in the
  // Trail. That is a stray line, not a broken history, and the
  // alternative -- a wider time window -- would swallow a first real
  // entry written straight after creating the Space, which is worse.
  const { results } = await env.DB.prepare(
    `SELECT id, kind, summary, block_id, event_count, created_at
       FROM activity_log
      WHERE space_id = ?
        AND kind != 'space_created'
        AND NOT (
          kind = 'block_added'
          AND created_at = (
            SELECT created_at FROM activity_log
             WHERE space_id = ? AND kind = 'space_created'
             LIMIT 1
          )
        )
      ORDER BY created_at ASC`
  )
    .bind(spaceId, spaceId)
    .all();
  const activity = results.map((row) => ({
    ...row,
    summary: sentence(withoutSpaceName(row.summary)),
    source: 'activity',
  }));

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
export async function updateTrailEntry(env, id, note) {
  const existing = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  if (!existing) return null;
  const summary = existing.kind === 'manual' ? truncateForSummary(note) : existing.summary;
  await env.DB.prepare(`UPDATE trail_entries SET note = ?, summary = ? WHERE id = ?`).bind(note, summary, id).run();
  const row = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  return parseTrailRow(row);
}
