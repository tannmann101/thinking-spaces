// Ported unchanged from backend/src/db/queries/constants.js -- no D1
// dependency, so nothing about the Worker port touches this file.

export const TEST_SPACE_ID = 'test-space';

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}
