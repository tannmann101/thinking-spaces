// --- Review -------------------------------------------------------
// A Review is a third Trail entry kind, not a separate concept: a
// deliberate, structured look-back at "what changed since last time,"
// distinct from a manual entry's free-form "why" and an auto entry's
// one-line structural note. It's still just a row in trail_entries --
// same storage, same Rewind (its skeleton_snapshot is captured exactly
// like every other entry's), same note-attaching path via
// updateTrailEntry (trail.js) (a Review's own kind isn't 'manual', so
// its auto-computed summary is left alone when a note gets attached,
// same as an auto entry's already is). This is the Time arc's third
// layer, reusing Reports' "diff what changed" idea but scoped to "since
// the last Review" instead of "right now."
//
// getReviewDraft is read-only -- it lets the person see what a Review
// would say *before* committing it to Trail permanently -- and
// createReview writes exactly that same computed summary, so the
// preview and the recorded entry can never disagree with each other.

import { getSpaceById } from './spaces.js';
import { listBlocksForSpace } from './blocks.js';
import { logTrailEntry } from './trail.js';

// --- Review -------------------------------------------------------
// A Review is a third Trail entry kind, not a separate concept: a
// deliberate, structured look-back at "what changed since last time,"
// distinct from a manual entry's free-form "why" and an auto entry's
// one-line structural note. It's still just a row in trail_entries --
// same storage, same Rewind (its skeleton_snapshot is captured exactly
// like every other entry's), same note-attaching path via
// updateTrailEntry (trail.js) (a Review's own kind isn't 'manual', so
// its auto-computed summary is left alone when a note gets attached,
// same as an auto entry's already is). This is the Time arc's third
// layer, reusing Reports' "diff what changed" idea but scoped to "since
// the last Review" instead of "right now."
//
// getReviewDraft is read-only -- it lets the person see what a Review
// would say *before* committing it to Trail permanently -- and
// createReview writes exactly that same computed summary, so the
// preview and the recorded entry can never disagree with each other.
export async function getReviewDraft(env, spaceId) {
  const space = await getSpaceById(env, spaceId);
  if (!space) return null;

  const lastReview = await env.DB.prepare(
    `SELECT created_at FROM trail_entries WHERE space_id = ? AND kind = 'review' ORDER BY created_at DESC LIMIT 1`
  )
    .bind(spaceId)
    .first();
  const sinceDate = lastReview ? lastReview.created_at : space.created_at;
  const sinceDay = sinceDate.slice(0, 10);
  // sinceDate is SQLite's `datetime('now')` format ('YYYY-MM-DD
  // HH:MM:SS'); a Session's endedAt is a JS toISOString() string -- both
  // UTC, but the two formats don't compare correctly as plain strings,
  // so this normalizes sinceDate to the same ISO shape first.
  const sinceDateIso = new Date(`${sinceDate.replace(' ', 'T')}Z`).toISOString();

  const blocks = await listBlocksForSpace(env, spaceId);
  // `>=`, not `>`: see the matching comment in the original Node module
  // -- a first-ever Review's sinceDate is the Space's own created_at,
  // and a Template's starter blocks land in that same second in real
  // usage, so a strict `>` would miss them.
  const newBlocks = blocks.filter((block) => block.created_at >= sinceDate);
  const blockCounts = {};
  newBlocks.forEach((block) => {
    blockCounts[block.type] = (blockCounts[block.type] || 0) + 1;
  });
  const blocksAdded = Object.entries(blockCounts).map(([type, count]) => ({ type, count }));

  const milestonesReached = blocks
    .filter(
      (block) =>
        block.type === 'milestone' && block.content.reached && block.content.reachedAt && block.content.reachedAt >= sinceDay
    )
    .map((block) => ({ label: block.content.label, reachedAt: block.content.reachedAt }));

  const sessionsCompleted = blocks
    .filter((block) => block.type === 'session' && block.content.endedAt && block.content.endedAt > sinceDateIso)
    .map((block) => ({ label: block.content.label, durationMinutes: block.content.durationMinutes || 0 }));
  const totalMinutesLogged = sessionsCompleted.reduce((sum, session) => sum + session.durationMinutes, 0);

  const summaryParts = [];
  if (newBlocks.length > 0) {
    summaryParts.push(`${newBlocks.length} ${newBlocks.length === 1 ? 'entry' : 'entries'} added`);
  }
  if (milestonesReached.length > 0) {
    summaryParts.push(`${milestonesReached.length} milestone${milestonesReached.length === 1 ? '' : 's'} reached`);
  }
  if (totalMinutesLogged > 0) {
    summaryParts.push(`${totalMinutesLogged} min logged`);
  }
  const summaryText = summaryParts.length > 0 ? `Review: ${summaryParts.join(', ')}` : 'Review: nothing new since last review';

  return {
    isFirstReview: !lastReview,
    sinceDate,
    blocksAdded,
    totalBlocksAdded: newBlocks.length,
    milestonesReached,
    sessionsCompleted,
    totalMinutesLogged,
    summaryText,
  };
}

export async function createReview(env, spaceId) {
  const draft = await getReviewDraft(env, spaceId);
  if (!draft) return null;
  const entry = await logTrailEntry(env, { spaceId, kind: 'review', summary: draft.summaryText });
  return { ...entry, changeSummary: draft.summaryText };
}
