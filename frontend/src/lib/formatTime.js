// Timestamps, said the way a person says them.
//
// Every page that showed a time used to call .toLocaleString() directly,
// which prints "9/5/2026, 8:40:08 PM" -- technically complete and almost
// never what you actually wanted to know. What you want to know is
// "yesterday," and the exact instant only when you go looking for it.
// So: the relative phrasing is what's rendered, and the full timestamp
// rides along in a title tooltip (see components/RelativeTime.jsx).
//
// Two shapes of timestamp reach this file, and they parse differently:
//   - SQLite's datetime('now') -- "YYYY-MM-DD HH:MM:SS", UTC but with no
//     "T" and no "Z", so Date() would read it as *local* time and land
//     hours off. This is what every created_at/updated_at column holds.
//   - A real ISO string carrying its own timezone (a Session's startedAt
//     and endedAt, written from the browser's own clock), which parses
//     correctly exactly as it is and must not be touched.
// toLocalDate() tells them apart and normalizes only the first.
//
// Three near-identical copies of that normalization used to live in
// Dashboard.jsx, TrailSpine.jsx and LogPage.jsx. One copy now.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toLocalDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || value === '') return new Date(NaN);
  // A SQLite datetime is the one with a space and no zone marker.
  const isSqliteDatetime = value.includes(' ') && !/[Zz]|[+-]\d\d:?\d\d$/.test(value);
  return new Date(isSqliteDatetime ? `${value.replace(' ', 'T')}Z` : value);
}

// How many calendar days apart two moments are, in the viewer's own local
// time -- deliberately not (now - then) / 24h, which would call 11pm and
// 1am "the same day ago" and 11pm Monday to 1am Tuesday "0 days apart".
// A person counts midnights, not elapsed hours.
function calendarDaysBetween(then, now) {
  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowMidnight - thenMidnight) / DAY);
}

// The fallback both phrasings share once a date is too old to name:
// drop the year inside the current year, keep it beyond that.
function formatCalendarDate(date, now) {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// Names an *instant*, for reading mid-sentence ("updated yesterday",
// "last touched 3 hours ago"). Lowercase on purpose, for that reason.
export function formatRelative(value, now = new Date()) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = now - date;
  // A viewer's clock running slightly ahead of the server's would
  // otherwise make a just-saved entry read as being in the future.
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const days = calendarDaysBetween(date, now);
  if (days === 0) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return formatCalendarDate(date, now);
}

// Names a *day*, for standing at the front of a phrase (a Log day
// heading, or a Session range that already carries its own two clock
// times). "Today" rather than "3 hours ago": a range's distance from
// now is the one thing it isn't trying to tell you.
export function formatDayLabel(value, now = new Date()) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';

  const days = calendarDaysBetween(date, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return formatCalendarDate(date, now);
}

// The whole truth, for the tooltip under a relative phrasing -- so
// choosing the readable wording never costs you the exact moment.
export function formatAbsolute(value) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTimeOfDay(value) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A finished Session: one day label, then the two clock times it ran
// between. A sitting that crossed midnight names the second day too,
// rather than silently implying both times fall on the first.
export function formatTimeRange(startedAt, endedAt, now = new Date()) {
  const start = toLocalDate(startedAt);
  const end = toLocalDate(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';

  const opening = `${formatDayLabel(start, now)}, ${formatTimeOfDay(start)}`;
  if (calendarDaysBetween(start, end) === 0) return `${opening} to ${formatTimeOfDay(end)}`;
  return `${opening} to ${formatDayLabel(end, now)}, ${formatTimeOfDay(end)}`;
}

// The machine-readable half of a <time> element. A SQLite datetime is
// not a valid datetime attribute as stored (no "T", no zone), so this
// hands over the normalized ISO form instead.
export function toDateTimeAttribute(value) {
  const date = toLocalDate(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
