// Two tiny, dependency-free values shared across every query module --
// kept separate specifically so nothing else in this directory needs
// to import a "real" module (spaces.js, blocks.js, ...) just to get a
// constant, which is what kept forcing awkward import cycles when
// these lived inline in the old single queries.js file.

// The one Space that always exists as Pass 2's scratch area. A fixed,
// well-known ID (rather than a new "is_test" column) keeps the schema
// exactly as CLAUDE.md specified it -- this is the one place that ID
// is defined, and everything else asks "does this id match?" through
// the isTestSpace flag computed in spaces.js, rather than hardcoding
// it elsewhere.
export const TEST_SPACE_ID = 'test-space';

// Today's date as 'YYYY-MM-DD', used wherever a date-only field (a
// Space's due_date, a Milestone's targetDate) needs comparing against
// "now" at day granularity.
export function todayString() {
  return new Date().toISOString().slice(0, 10);
}
