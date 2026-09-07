import { describe, it, expect } from 'vitest';
import {
  toLocalDate,
  formatRelative,
  formatDayLabel,
  formatAbsolute,
  formatTimeOfDay,
  formatTimeRange,
  toDateTimeAttribute,
} from './formatTime.js';

// A fixed "now" so these never depend on when the suite runs -- built
// from local components, and every relative input below is derived from
// it the same way, so they don't depend on *where* it runs either.
// (The one thing that genuinely is timezone-sensitive, reading a SQLite
// timestamp as UTC, is asserted against toISOString(), which isn't.)
const NOW = new Date(2026, 8, 7, 15, 0, 0); // Mon 7 Sep 2026, 3pm local
const minutesBefore = (n) => new Date(NOW.getTime() - n * 60 * 1000);
const daysBefore = (n, hour = 9) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, hour, 0, 0);

describe('toLocalDate', () => {
  it("reads SQLite's datetime('now') shape as UTC", () => {
    // The bug this exists to prevent: without the normalization, Date()
    // reads this as local time and lands hours off.
    expect(toLocalDate('2026-09-07 12:00:00').toISOString()).toBe('2026-09-07T12:00:00.000Z');
  });

  it('leaves a real ISO string exactly as it is', () => {
    expect(toLocalDate('2026-09-07T12:00:00.000Z').toISOString()).toBe('2026-09-07T12:00:00.000Z');
  });

  it('leaves an ISO string carrying its own offset alone', () => {
    expect(toLocalDate('2026-09-07T14:00:00+02:00').toISOString()).toBe('2026-09-07T12:00:00.000Z');
  });

  it('gives an invalid date for junk rather than throwing', () => {
    expect(Number.isNaN(toLocalDate('').getTime())).toBe(true);
    expect(Number.isNaN(toLocalDate(null).getTime())).toBe(true);
  });
});

describe('formatRelative', () => {
  it('says "just now" under a minute', () => {
    expect(formatRelative(minutesBefore(0.5), NOW)).toBe('just now');
  });

  it('does not call a clock running slightly ahead the future', () => {
    expect(formatRelative(minutesBefore(-0.5), NOW)).toBe('just now');
  });

  it('counts minutes, then hours', () => {
    expect(formatRelative(minutesBefore(1), NOW)).toBe('1 minute ago');
    expect(formatRelative(minutesBefore(40), NOW)).toBe('40 minutes ago');
    expect(formatRelative(minutesBefore(180), NOW)).toBe('3 hours ago');
  });

  it('says "yesterday" by calendar day, not by 24 elapsed hours', () => {
    // 20 hours earlier, but the previous calendar day -- a person says
    // "yesterday" here, not "20 hours ago".
    expect(formatRelative(daysBefore(1, 19), NOW)).toBe('yesterday');
  });

  it('names the weekday inside the last week', () => {
    const thursday = daysBefore(4);
    expect(formatRelative(thursday, NOW)).toBe(
      thursday.toLocaleDateString(undefined, { weekday: 'long' }),
    );
  });

  it('falls back to a date beyond a week, with the year only when it differs', () => {
    expect(formatRelative(daysBefore(40), NOW)).not.toContain('2026');
    expect(formatRelative(daysBefore(40), NOW)).toMatch(/\d/);
    expect(formatRelative(daysBefore(400), NOW)).toContain('2025');
  });

  it('returns an empty string for a missing timestamp', () => {
    expect(formatRelative(undefined, NOW)).toBe('');
  });
});

describe('formatDayLabel', () => {
  it('names a day rather than a distance', () => {
    expect(formatDayLabel(daysBefore(0, 12), NOW)).toBe('Today');
    expect(formatDayLabel(daysBefore(1, 19), NOW)).toBe('Yesterday');
    const thursday = daysBefore(4);
    expect(formatDayLabel(thursday, NOW)).toBe(
      thursday.toLocaleDateString(undefined, { weekday: 'long' }),
    );
    expect(formatDayLabel(daysBefore(40), NOW)).toMatch(/\d/);
  });
});

describe('formatTimeRange', () => {
  it('names the day once when a sitting stays inside it', () => {
    const text = formatTimeRange(daysBefore(0, 12), daysBefore(0, 13), NOW);
    expect(text.startsWith('Today, ')).toBe(true);
    // One day label, and the two clock times it ran between.
    expect(text.split('Today').length - 1).toBe(1);
    expect(text).toContain(' to ');
  });

  it('names the second day too when a sitting crosses midnight', () => {
    const text = formatTimeRange(daysBefore(1, 23), daysBefore(0, 1), NOW);
    expect(text).toContain('Yesterday');
    expect(text).toContain('Today');
  });

  it('returns an empty string when either end is missing', () => {
    expect(formatTimeRange(daysBefore(0, 12), null, NOW)).toBe('');
  });
});

describe('formatAbsolute and the <time> attribute', () => {
  it('keeps the whole truth available for a tooltip', () => {
    const text = formatAbsolute(daysBefore(0, 12));
    expect(text).toContain('2026');
    expect(text).toContain('September');
  });

  it('hands over a valid datetime attribute even for a SQLite timestamp', () => {
    expect(toDateTimeAttribute('2026-09-07 12:00:00')).toBe('2026-09-07T12:00:00.000Z');
    expect(toDateTimeAttribute('nonsense')).toBeUndefined();
  });

  it('formats a bare time of day', () => {
    expect(formatTimeOfDay(daysBefore(0, 12))).toMatch(/\d/);
  });
});
