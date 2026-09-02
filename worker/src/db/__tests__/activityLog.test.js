import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { logActivity } from '../activityLog.js';
import { TEST_SPACE_ID } from '../constants.js';
import { resetDb } from '../../../test/helpers/resetDb.js';

async function allActivity() {
  const { results } = await env.DB.prepare('SELECT * FROM activity_log').all();
  return results;
}

describe('logActivity', () => {
  beforeEach(async () => {
    await resetDb(env);
  });

  it('inserts a row with the given fields', async () => {
    await logActivity(env, { spaceId: 'sp-1', spaceTitle: 'A Space', kind: 'space_created', summary: 'Created "A Space"' });
    const rows = await allActivity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      space_id: 'sp-1',
      space_title: 'A Space',
      kind: 'space_created',
      summary: 'Created "A Space"',
    });
  });

  it('allows a null spaceId/spaceTitle for events not tied to a Space (e.g. Template changes)', async () => {
    await logActivity(env, { kind: 'template_created', summary: 'Created template "X"' });
    const rows = await allActivity();
    expect(rows[0].space_id).toBeNull();
    expect(rows[0].space_title).toBeNull();
  });

  it('silently refuses to log anything for the Test Space', async () => {
    await logActivity(env, { spaceId: TEST_SPACE_ID, spaceTitle: 'Test Space', kind: 'space_created', summary: 'should not appear' });
    expect(await allActivity()).toHaveLength(0);
  });
});
