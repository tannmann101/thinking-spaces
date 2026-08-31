import { db } from '../index.js';
import { TEST_SPACE_ID, todayString } from './constants.js';
import { WORK_TYPES } from './work.js';

// --- Insights -----------------------------------------------------------
// "See trends/metrics/insights across [Spaces]" was in the Dashboard's
// vision from the start (see CLAUDE.md); log.js's getActivityStats was a
// first taste of it. This is the fuller version, one function per
// facet, all surfaced together on their own page (InsightsPage.jsx)
// rather than folded into the Dashboard's existing digests -- there's
// real depth here, not just another one-line stat. The Test Space is
// excluded from every query below, same reasoning as everywhere else
// it's excluded: scratch content, not real thinking to draw insight from.

// Mirrors CONFIDENCE_LEVELS in frontend/src/registry/blocks.js, kept in
// least- to most-confident order so a bar chart renders in a meaningful
// sequence rather than alphabetical or insertion order.
const CONFIDENCE_LEVELS = ['questioned', 'tentative', 'moderate', 'solid', 'certain'];

// What kinds of thinking-work exist across every Space, and how settled
// it feels overall -- the most direct payoff of building ten distinct
// Work Types rather than one generic block with a label.
export function getWorkMixInsights() {
  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT type, content FROM blocks WHERE type IN (${placeholders}) AND space_id != ?`)
    .all(...WORK_TYPES, TEST_SPACE_ID);

  const typeCounts = {};
  const confidenceCounts = {};
  rows.forEach((row) => {
    typeCounts[row.type] = (typeCounts[row.type] || 0) + 1;
    const { confidence } = JSON.parse(row.content);
    const level = confidence || 'tentative';
    confidenceCounts[level] = (confidenceCounts[level] || 0) + 1;
  });

  return {
    total: rows.length,
    byType: WORK_TYPES.map((type) => ({ type, count: typeCounts[type] || 0 })),
    byConfidence: CONFIDENCE_LEVELS.map((level) => ({ level, count: confidenceCounts[level] || 0 })),
  };
}

// Two facets of "what's actually going on" that only show up once you
// look across every Space at once: a Category name recurring in
// several unrelated Spaces is a real cross-cutting theme, not just
// per-Space organization; and every open Tension anywhere is an
// unresolved conflict in your reasoning that today only ever shows up
// one Space at a time (as a crack in that Space's own glyph).
export function getThemeInsights() {
  const spaceRows = db.prepare(`SELECT id, title, categories FROM spaces WHERE id != ?`).all(TEST_SPACE_ID);

  const categoryToTitles = new Map();
  spaceRows.forEach((row) => {
    JSON.parse(row.categories || '[]').forEach((name) => {
      if (!categoryToTitles.has(name)) categoryToTitles.set(name, new Set());
      categoryToTitles.get(name).add(row.title);
    });
  });
  const recurringCategories = [...categoryToTitles.entries()]
    .filter(([, titles]) => titles.size > 1)
    .map(([name, titles]) => ({ name, spaceCount: titles.size, spaceTitles: [...titles] }))
    .sort((a, b) => b.spaceCount - a.spaceCount);

  // Every item in a Tensions lane counts as open -- no "resolved" state
  // exists yet (same reasoning as spaces.js's per-Space
  // getOpenTensionCount), so this is a straight count and list, not a
  // filter.
  const tensionRows = db
    .prepare(
      `SELECT blocks.space_id, spaces.title AS space_title, blocks.content
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type = 'list' AND json_extract(blocks.properties, '$.skeletonLane') = 'tensions'
         AND blocks.space_id != ?`
    )
    .all(TEST_SPACE_ID);
  const openTensions = tensionRows.flatMap((row) => {
    const content = JSON.parse(row.content);
    return (content.items || []).map((item) => ({
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      label: item.text,
    }));
  });

  return { recurringCategories, openTensionCount: openTensions.length, openTensions };
}

// Whether thinking is actually moving -- a weekly count of every
// structural/Trail event over the last `weeks` (same union
// log.js's listGlobalActivity already reads from, just bucketed by
// week instead of listed individually) -- plus which Spaces have gone
// quiet long enough to be worth a second look, independent of their
// manually-set status (a Space can sit at "developing" indefinitely
// without anyone touching it).
export function getActivityTrendInsights(weeks = 8) {
  const weeklyCounts = db
    .prepare(
      `SELECT strftime('%Y-%W', created_at) AS week, COUNT(*) AS count
       FROM (
         SELECT created_at FROM activity_log
         UNION ALL
         SELECT trail_entries.created_at FROM trail_entries
         JOIN spaces ON spaces.id = trail_entries.space_id
         WHERE spaces.id != ?
       )
       WHERE created_at >= datetime('now', ?)
       GROUP BY week
       ORDER BY week ASC`
    )
    .all(TEST_SPACE_ID, `-${weeks * 7} days`);

  const staleThresholdDays = 30;
  const staleSpaces = db
    .prepare(
      `SELECT id, title, updated_at,
              CAST(julianday('now') - julianday(updated_at) AS INTEGER) AS days_since_update
       FROM spaces
       WHERE id != ? AND julianday('now') - julianday(updated_at) > ?
       ORDER BY updated_at ASC`
    )
    .all(TEST_SPACE_ID, staleThresholdDays);

  return {
    weeklyCounts,
    staleThresholdDays,
    staleSpaces: staleSpaces.map((row) => ({ id: row.id, title: row.title, daysSinceUpdate: row.days_since_update })),
  };
}

// The Work -> Synthesis -> Resource funnel, plus the external/internal
// split Provenance introduced: how much of what exists was brought in
// versus produced, and how much of the raw thinking has actually been
// distilled into a finished piece versus still sitting as scattered
// claims. Deliberately just counts, not item-level tracking -- Synthesis
// copies its sources' text rather than keeping a live link back to the
// specific Work item ids used, so "which claims fed which Synthesis"
// isn't a question the current data can answer; how many of each exist
// is.
export function getProvenanceInsights() {
  const originRows = db
    .prepare(`SELECT origin, COUNT(*) AS count FROM spaces WHERE id != ? GROUP BY origin`)
    .all(TEST_SPACE_ID);
  const byOrigin = { external: 0, internal: 0, none: 0 };
  originRows.forEach((row) => {
    if (row.origin === 'external') byOrigin.external = row.count;
    else if (row.origin === 'internal') byOrigin.internal = row.count;
    else byOrigin.none = row.count;
  });

  const synthesisCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM spaces
       WHERE id != ? AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'synthesis')`
    )
    .get(TEST_SPACE_ID).count;
  const promotedCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM spaces
       WHERE id != ?
         AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'synthesis')
         AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'resource')`
    )
    .get(TEST_SPACE_ID).count;

  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const workItemCount = db
    .prepare(`SELECT COUNT(*) AS count FROM blocks WHERE type IN (${placeholders}) AND space_id != ?`)
    .get(...WORK_TYPES, TEST_SPACE_ID).count;

  return { byOrigin, synthesisCount, promotedCount, workItemCount };
}

// The Time arc's own facet of Insights -- the arc's final, cross-
// cutting layer, added now that due dates, Milestones, Sessions, and
// Review all exist to have something worth summing up: what's coming
// up, what's overdue, how much time has actually been logged, and
// which Spaces have gone quiet on reflection even if they haven't
// gone quiet on activity. The Test Space is excluded, same reasoning
// as every other Insights query.
export function getTimeInsights() {
  const today = todayString();

  const dueDateRows = db
    .prepare(`SELECT id, title, due_date FROM spaces WHERE id != ? AND due_date IS NOT NULL ORDER BY due_date ASC`)
    .all(TEST_SPACE_ID);
  const overdueSpaces = dueDateRows.filter((row) => row.due_date < today);
  const upcomingSpaces = dueDateRows.filter((row) => row.due_date >= today);

  const milestoneRows = db
    .prepare(
      `SELECT blocks.content AS content, spaces.id AS space_id, spaces.title AS space_title
       FROM blocks JOIN spaces ON spaces.id = blocks.space_id
       WHERE blocks.type = 'milestone' AND blocks.space_id != ?`
    )
    .all(TEST_SPACE_ID);
  const milestones = milestoneRows.map((row) => ({
    ...JSON.parse(row.content),
    spaceId: row.space_id,
    spaceTitle: row.space_title,
  }));
  const reachedCount = milestones.filter((milestone) => milestone.reached).length;
  const overdueMilestones = milestones.filter(
    (milestone) => !milestone.reached && milestone.targetDate && milestone.targetDate < today
  );

  const sessionRows = db.prepare(`SELECT content FROM blocks WHERE type = 'session' AND space_id != ?`).all(TEST_SPACE_ID);
  const sessions = sessionRows.map((row) => JSON.parse(row.content));
  const completedSessions = sessions.filter((session) => session.endedAt);
  const totalMinutesLogged = completedSessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
  const runningCount = sessions.filter((session) => session.startedAt && !session.endedAt).length;

  // A Space can be full of recent activity (Insights' own staleness
  // check already covers that) while never once being deliberately
  // reflected on -- this is a different question, answered the same
  // "days since the most recent matching event" way that staleness is.
  const reviewStaleThresholdDays = 14;
  const reviewedRows = db
    .prepare(
      `SELECT trail_entries.space_id AS id, spaces.title AS title,
              MAX(trail_entries.created_at) AS last_reviewed,
              CAST(julianday('now') - julianday(MAX(trail_entries.created_at)) AS INTEGER) AS days_since
       FROM trail_entries
       JOIN spaces ON spaces.id = trail_entries.space_id
       WHERE trail_entries.kind = 'review' AND spaces.id != ?
       GROUP BY trail_entries.space_id`
    )
    .all(TEST_SPACE_ID);
  const reviewedSpaceIds = new Set(reviewedRows.map((row) => row.id));
  const neverReviewed = db
    .prepare(`SELECT id, title FROM spaces WHERE id != ?`)
    .all(TEST_SPACE_ID)
    .filter((space) => !reviewedSpaceIds.has(space.id));
  const staleReviews = reviewedRows.filter((row) => row.days_since > reviewStaleThresholdDays).sort((a, b) => b.days_since - a.days_since);

  return {
    dueDates: { overdue: overdueSpaces, upcoming: upcomingSpaces.slice(0, 5) },
    milestones: { total: milestones.length, reachedCount, overdueMilestones },
    sessions: { completedCount: completedSessions.length, totalMinutesLogged, runningCount },
    review: { neverReviewed, staleReviews, reviewStaleThresholdDays },
  };
}
