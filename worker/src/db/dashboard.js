// --- Dashboard aggregations -------------------------------------------
// Cross-Space surfacing features. The Test Space is excluded from all
// three -- it's scratch content, not something worth being reminded to
// review, reading about in a digest, or resurfaced as "maybe revisit
// this."

import { TEST_SPACE_ID, todayString } from './constants.js';
import { parseTrailRow } from './trail.js';

// Any List item anywhere with a reviewBy date in the past. Uses
// SQLite's json_each to look inside every List block's items array
// without pulling all of them into JS first.
export async function listOverdueReviews(env) {
  const { results } = await env.DB.prepare(
    `SELECT spaces.id AS space_id, spaces.title AS space_title, blocks.id AS block_id, item.value AS item_json
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     JOIN json_each(blocks.content, '$.items') AS item
     WHERE blocks.type = 'list'
       AND spaces.id != ?
       AND json_extract(item.value, '$.reviewBy') IS NOT NULL
       AND json_extract(item.value, '$.reviewBy') < date('now')
     ORDER BY json_extract(item.value, '$.reviewBy') ASC`
  )
    .bind(TEST_SPACE_ID)
    .all();
  return results.map((row) => ({
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    blockId: row.block_id,
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
export async function getWeekCalendar(env) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const rangeStart = days[0];
  const rangeEnd = days[6];
  const today = todayString();

  const trailRows = await env.DB.prepare(
    `SELECT trail_entries.*, spaces.title AS space_title
     FROM trail_entries
     JOIN spaces ON spaces.id = trail_entries.space_id
     WHERE date(trail_entries.created_at) BETWEEN ? AND ?
       AND spaces.id != ?
     ORDER BY trail_entries.created_at ASC`
  )
    .bind(rangeStart, rangeEnd, TEST_SPACE_ID)
    .all();
  const trailByDay = {};
  for (const row of trailRows.results) {
    const day = row.created_at.slice(0, 10);
    (trailByDay[day] ||= []).push({
      ...parseTrailRow(row),
      spaceId: row.space_id,
      spaceTitle: row.space_title,
    });
  }

  const dueSpaceRows = await env.DB.prepare(`SELECT id, title, due_date FROM spaces WHERE id != ? AND due_date BETWEEN ? AND ?`)
    .bind(TEST_SPACE_ID, rangeStart, rangeEnd)
    .all();
  const dueSpacesByDay = {};
  for (const row of dueSpaceRows.results) {
    (dueSpacesByDay[row.due_date] ||= []).push({ spaceId: row.id, spaceTitle: row.title });
  }

  // Every Project name, looked up once rather than per-row -- both
  // Milestones and Sessions below resolve their own properties.projectId
  // against this same map.
  const projectRows = await env.DB.prepare(`SELECT id, name FROM projects`).all();
  const projectNames = Object.fromEntries(projectRows.results.map((row) => [row.id, row.name]));

  const milestoneRows = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.content AS content, blocks.properties AS properties, spaces.id AS space_id, spaces.title AS space_title
     FROM blocks JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'milestone' AND blocks.space_id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const milestonesByDay = {};
  for (const row of milestoneRows.results) {
    const milestone = JSON.parse(row.content);
    const properties = JSON.parse(row.properties);
    if (milestone.targetDate && milestone.targetDate >= rangeStart && milestone.targetDate <= rangeEnd) {
      // The block's own id and full content travel along too -- not
      // just the summary fields -- so the Dashboard can mark a
      // Milestone reached right from the calendar cell.
      (milestonesByDay[milestone.targetDate] ||= []).push({
        id: row.block_id,
        content: milestone,
        label: milestone.label,
        reached: milestone.reached,
        spaceId: row.space_id,
        spaceTitle: row.space_title,
        projectName: properties.projectId ? projectNames[properties.projectId] || null : null,
      });
    }
  }

  // A completed Session lands on the day it ended; a still-running one
  // lands on the day it started, since it has no end day yet.
  const sessionRows = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.content AS content, blocks.properties AS properties, spaces.id AS space_id, spaces.title AS space_title
     FROM blocks JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'session' AND blocks.space_id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const sessionsByDay = {};
  for (const row of sessionRows.results) {
    const session = JSON.parse(row.content);
    const properties = JSON.parse(row.properties);
    const isRunning = Boolean(session.startedAt) && !session.endedAt;
    const day = (session.endedAt || session.startedAt || '').slice(0, 10);
    if (day && day >= rangeStart && day <= rangeEnd) {
      // Same reasoning as Milestones above -- id and full content
      // travel along so a running Session can be stopped right from
      // the calendar cell.
      (sessionsByDay[day] ||= []).push({
        id: row.block_id,
        content: session,
        label: session.label,
        durationMinutes: session.durationMinutes,
        isRunning,
        spaceId: row.space_id,
        spaceTitle: row.space_title,
        projectName: properties.projectId ? projectNames[properties.projectId] || null : null,
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
    sessions: sessionsByDay[date] || [],
  }));
}

// One suggestion for "maybe revisit this": the dormant/inactive Space
// that's gone the longest without an update. Not random -- the most
// neglected one is the one most likely to actually be forgotten.
export async function suggestSpaceToResurface(env) {
  const row = await env.DB.prepare(
    `SELECT id, title, status, updated_at
     FROM spaces
     WHERE status IN ('dormant', 'inactive') AND id != ?
     ORDER BY updated_at ASC
     LIMIT 1`
  )
    .bind(TEST_SPACE_ID)
    .first();
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
export async function getNeedsAttentionCount(env) {
  const overdueReviewItems = (await listOverdueReviews(env)).length;

  const overdueSpaces = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM spaces WHERE id != ? AND due_date IS NOT NULL AND due_date < date('now')`
  )
    .bind(TEST_SPACE_ID)
    .first();

  const overdueMilestones = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM blocks
     WHERE type = 'milestone'
       AND space_id != ?
       AND json_extract(content, '$.reached') = 0
       AND json_extract(content, '$.targetDate') IS NOT NULL
       AND json_extract(content, '$.targetDate') < date('now')`
  )
    .bind(TEST_SPACE_ID)
    .first();

  return overdueReviewItems + overdueSpaces.count + overdueMilestones.count;
}
