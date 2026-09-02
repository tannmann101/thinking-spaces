// Ported from backend/src/changeSummary.js -- pure JS, identical on
// both sides, same reasoning linkPreview.js was ported verbatim.
//
// Pure functions that turn a "before" and "after" content change into a
// short, human sentence -- surfaced as a toast at the moment of the
// action (see frontend/src/components/Toast.jsx), not just discoverable
// later on the Log/Trail pages. No database access, no framework
// dependency.
//
// Deliberately narrow: most content edits (a caption, a note, a typo
// fix) have nothing more interesting to say than "saved" -- this only
// covers the handful of cases where a specific field flipping has a
// real, nameable implication elsewhere in the app (Insights, the Week
// digest). Adding a new case here means naming one more real
// implication, not guessing at general-purpose diff prose.

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
  return null;
}
