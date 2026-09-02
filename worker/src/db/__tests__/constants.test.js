import { describe, it, expect } from 'vitest';
import { TEST_SPACE_ID, todayString } from '../constants.js';

describe('TEST_SPACE_ID', () => {
  it('is a fixed, well-known id', () => {
    expect(TEST_SPACE_ID).toBe('test-space');
  });
});

describe('todayString', () => {
  it('returns a YYYY-MM-DD date, matching the system clock', () => {
    const result = todayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(new Date().toISOString().slice(0, 10));
  });
});
