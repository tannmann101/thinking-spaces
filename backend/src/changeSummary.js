// Pure functions that turn a "before" and "after" content change into a
// short, human sentence -- surfaced as a toast at the moment of the
// action (see frontend/src/components/Toast.jsx), not just discoverable
// later on the Log/Trail pages. Kept separate from queries.js the same
// way reportFormat.js already keeps prose formatting apart from data
// access. No database access, no Express dependency.
//
// Deliberately narrow: most content edits (a caption, a note, a typo
// fix) have nothing more interesting to say than "saved" -- this only
// covers the handful of cases where a specific field flipping has a
// real, nameable implication elsewhere in the app (Insights, the Week
// digest). Adding a new case here means naming one more real
// implication, not guessing at general-purpose diff prose.
//
// Also read by updateBlockContent (db/queries/blocks.js) to decide how
// an edit is recorded: a change this function can name gets its own
// activity_log row, anything else coalesces into a plain "edited" row.

export function describeBlockContentChange(existingBlock, newContent) {
  if (existingBlock.type === 'milestone') {
    const wasReached = Boolean(existingBlock.content.reached);
    const isReached = Boolean(newContent.reached);
    if (wasReached !== isReached) {
      return isReached
        ? 'Milestone reached -- now counted in Insights and the Week digest'
        : 'Milestone unmarked -- no longer counted as reached';
    }
  }
  if (existingBlock.type === 'session') {
    const wasRunning = Boolean(existingBlock.content.startedAt) && !existingBlock.content.endedAt;
    if (wasRunning && newContent.endedAt) {
      const minutes = newContent.durationMinutes || 0;
      return `Session completed -- ${minutes} min logged, now counted in Insights and the Week digest`;
    }
  }
  return null;
}
