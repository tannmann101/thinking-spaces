// Ported from backend/src/db/queries/dashboard.js.

import { TEST_SPACE_ID, todayString } from './constants.js';
import { parseTrailRow } from './trail.js';

export async function listOverdueReviews(env) {
  const { results } = await env.DB.prepare(
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
    .bind(TEST_SPACE_ID)
    .all();
  return results.map((row) => ({
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    item: JSON.parse(row.item_json),
  }));
}

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

  const milestoneRows = await env.DB.prepare(
    `SELECT blocks.content AS content, spaces.id AS space_id, spaces.title AS space_title
     FROM blocks JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'milestone' AND blocks.space_id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const milestonesByDay = {};
  for (const row of milestoneRows.results) {
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

export async function suggestSpaceToResurface(env) {
  const row = await env.DB.prepare(
    `SELECT id, title, status, updated_at
     FROM spaces
     WHERE status IN ('nascent', 'dormant') AND id != ?
     ORDER BY updated_at ASC
     LIMIT 1`
  )
    .bind(TEST_SPACE_ID)
    .first();
  return row || null;
}

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
