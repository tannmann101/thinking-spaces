import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../index.js';
import { logActivity } from '../activityLog.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../../test/helpers/resetDb.js';

function allActivity() {
  return db.prepare('SELECT * FROM activity_log').all();
}

describe('logActivity', () => {
  beforeEach(() => {
    resetDb();
  });

  it('inserts a row with the given fields', () => {
    logActivity({ spaceId: 'sp-1', spaceTitle: 'A Space', kind: 'space_created', summary: 'Created "A Space"' });
    const rows = allActivity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      space_id: 'sp-1',
      space_title: 'A Space',
      kind: 'space_created',
      summary: 'Created "A Space"',
    });
  });

  it('allows a null spaceId/spaceTitle for events not tied to a Space (e.g. Template changes)', () => {
    logActivity({ kind: 'template_created', summary: 'Created template "X"' });
    const rows = allActivity();
    expect(rows[0].space_id).toBeNull();
    expect(rows[0].space_title).toBeNull();
  });

  it('records a blockId when given one, and leaves it null otherwise', () => {
    logActivity({ spaceId: 'sp-1', blockId: 'block-1', kind: 'block_added', summary: 'x' });
    logActivity({ spaceId: 'sp-1', kind: 'space_status_changed', summary: 'y' });
    const rows = allActivity();
    expect(rows.find((r) => r.kind === 'block_added').block_id).toBe('block-1');
    expect(rows.find((r) => r.kind === 'space_status_changed').block_id).toBeNull();
  });

  it('silently refuses to log anything for the Test Space', () => {
    logActivity({ spaceId: TEST_SPACE_ID, spaceTitle: 'Test Space', kind: 'space_created', summary: 'should not appear' });
    expect(allActivity()).toHaveLength(0);
  });
});
