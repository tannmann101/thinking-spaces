import { db } from '../index.js';
import { TEST_SPACE_ID, todayString } from './constants.js';
import { parseTrailRow } from './trail.js';

// --- Dashboard aggregations -------------------------------------------
// Cross-Space surfacing features. The Test Space is excluded from all
// three -- it's scratch content, not something worth being reminded to
// review, reading about in a digest, or resurfaced as "maybe revisit
// this."

// Any List item anywhere with a reviewBy date in the past. Uses
// SQLite's json_each to look inside every List block's items array
// without pulling all of them into JS first.
export function listOverdueReviews() {
  const rows = db
    .prepare(
      `SELECT spaces.id AS space_id, spaces.title AS space_title, item.value AS item_json
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       JOIN json_each(blocks.content, '$.items') AS item
       WHERE blocks.type = 'list'
         AND spaces.id != ?
         AND json_extract(item.value, '$.reviewBy') IS NOT NULL
         AND json_extract(item.value, '$.reviewBy') < date('now')
       ORDER BY json_extract(item.value, '$.reviewBy') ASC`
    )
    .all(TEST_SPACE_ID);
  return rows.map((row) => ({
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    item: JSON.parse(row.item_json),
  }));
}

// The Dashboard's Week calendar: one entry per day of the current
// calendar week (Sunday through Saturday), each carrying whatever
// actually happened that day (Trail entries -- what a flat "this week"
// list used to show with no explanation of what "week" meant) and
// whatever is due that day (a Space's own due_date, a Milestone's
// targetDate). Answering "how does it know what this week is" is the
// whole point -- a real calendar grid with day labels/dates makes that
// visible for free, instead of it being a fact only the code knows.
export function getWeekCalendar() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // back up to Sunday
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const rangeStart = days[0];
  const rangeEnd = days[6];
  const today = todayString();

  const trailRows = db
    .prepare(
      `SELECT trail_entries.*, spaces.title AS space_title
       FROM trail_entries
       JOIN spaces ON spaces.id = trail_entries.space_id
       WHERE date(trail_entries.created_at) BETWEEN ? AND ?
         AND spaces.id != ?
       ORDER BY trail_entries.created_at ASC`
    )
    .all(rangeStart, rangeEnd, TEST_SPACE_ID);
  const trailByDay = {};
  for (const row of trailRows) {
    const day = row.created_at.slice(0, 10);
    (trailByDay[day] ||= []).push({
      ...parseTrailRow(row),
      spaceId: row.space_id,
      spaceTitle: row.space_title,
    });
  }

  const dueSpaceRows = db
    .prepare(`SELECT id, title, due_date FROM spaces WHERE id != ? AND due_date BETWEEN ? AND ?`)
    .all(TEST_SPACE_ID, rangeStart, rangeEnd);
  const dueSpacesByDay = {};
  for (const row of dueSpaceRows) {
    (dueSpacesByDay[row.due_date] ||= []).push({ spaceId: row.id, spaceTitle: row.title });
  }

  const milestoneRows = db
    .prepare(
      `SELECT blocks.content AS content, spaces.id AS space_id, spaces.title AS space_title
       FROM blocks JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type = 'milestone' AND blocks.space_id != ?`
    )
    .all(TEST_SPACE_ID);
  const milestonesByDay = {};
  for (const row of milestoneRows) {
    const milestone = JSON.parse(row.content);
    if (milestone.targetDate && milestone.targetDate >= rangeStart && milestone.targetDate <= rangeEnd) {
      (milestonesByDay[milestone.targetDate] ||= []).push({
        label: milestone.label,
        reached: milestone.reached,
        spaceId: row.space_id,
        spaceTitle: row.space_title,
      });
    }
  }

  return days.map((date) => ({
    date,
    isToday: date === today,
    isPast: date < today,
    trail: trailByDay[date] || [],
    dueSpaces: dueSpacesByDay[date] || [],
    milestones: milestonesByDay[date] || [],
  }));
}

// One suggestion for "maybe revisit this": the nascent/dormant Space
// that's gone the longest without an update. Not random -- the most
// neglected one is the one most likely to actually be forgotten.
export function suggestSpaceToResurface() {
  const row = db
    .prepare(
      `SELECT id, title, status, updated_at
       FROM spaces
       WHERE status IN ('nascent', 'dormant') AND id != ?
       ORDER BY updated_at ASC
       LIMIT 1`
    )
    .get(TEST_SPACE_ID);
  return row || null;
}

// The count behind the sidebar's "needs attention" badge -- deliberately
// narrow and already-actionable, not a raw activity count. Three
// things: overdue List items (reviewBy), overdue Spaces (due_date),
// and overdue Milestones (targetDate, not yet reached). Trail Review
// staleness ("never reviewed"/"14+ days since last") is deliberately
// left out -- it's true of nearly every Space nearly all the time (see
// getTimeInsights), so counting it here would make the badge read as
// permanently alarmed rather than a genuine signal worth glancing at.
export function getNeedsAttentionCount() {
  const overdueReviewItems = listOverdueReviews().length;

  const overdueSpaces = db
    .prepare(`SELECT COUNT(*) AS count FROM spaces WHERE id != ? AND due_date IS NOT NULL AND due_date < date('now')`)
    .get(TEST_SPACE_ID).count;

  const overdueMilestones = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM blocks
       WHERE type = 'milestone'
         AND space_id != ?
         AND json_extract(content, '$.reached') = 0
         AND json_extract(content, '$.targetDate') IS NOT NULL
         AND json_extract(content, '$.targetDate') < date('now')`
    )
    .get(TEST_SPACE_ID).count;

  return overdueReviewItems + overdueSpaces + overdueMilestones;
}
