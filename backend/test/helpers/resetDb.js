import { db } from '../../src/db/index.js';

// Every test file gets its own fresh ':memory:' database (see
// vitest.config.js), but individual `it()` blocks within one file share
// that same database instance -- calling this in a `beforeEach` clears
// every table back to empty between tests, without paying the cost of
// rebuilding the schema from scratch each time. Foreign keys are
// toggled off for the duration since deletion order across
// spaces/blocks/workspaces/trail_entries would otherwise matter.
const TABLES = ['trail_entries', 'blocks', 'workspaces', 'activity_log', 'spaces', 'templates'];

export function resetDb() {
  db.pragma('foreign_keys = OFF');
  TABLES.forEach((table) => db.exec(`DELETE FROM ${table}`));
  db.pragma('foreign_keys = ON');
}
