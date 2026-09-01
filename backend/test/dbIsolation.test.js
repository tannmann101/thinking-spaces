// A permanent guard on the test suite's own foundation, not a
// throwaway probe: every other test file trusts that it gets a fresh,
// isolated ':memory:' database (never the real personal data file) and
// that resetDb() actually clears state between tests. If either of
// those ever silently broke -- a Vitest config change, a resetDb bug --
// every other test's results would be meaningless without this one
// catching it first.
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/index.js';
import { createSpace } from '../src/db/queries/spaces.js';
import { resetDb } from './helpers/resetDb.js';

describe('test database isolation', () => {
  beforeEach(() => {
    resetDb();
  });

  it('starts empty, schema applied, foreign keys enforced', () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM spaces').get().count;
    expect(count).toBe(0);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('resetDb actually clears state between tests', () => {
    createSpace({ title: 'Leftover from previous test?' });
    const count = db.prepare('SELECT COUNT(*) AS count FROM spaces').get().count;
    expect(count).toBe(1);
  });

  it('confirms the previous test\'s row is gone', () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM spaces').get().count;
    expect(count).toBe(0);
  });
});
