// Ported from backend/src/db/queries/insights.js.

import { TEST_SPACE_ID, todayString } from './constants.js';
import { WORK_TYPES } from './work.js';

const CONFIDENCE_LEVELS = ['questioned', 'tentative', 'moderate', 'solid', 'certain'];

// See backend/src/db/queries/insights.js's own comment -- these build
// the `reading` sentence each facet returns alongside its raw numbers.
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildWorkMixReading(total, byType, byConfidence) {
  if (total === 0) return null;
  const topType = byType.reduce((a, b) => (b.count > a.count ? b : a));
  const topConfidence = byConfidence.reduce((a, b) => (b.count > a.count ? b : a));
  const settledCount = byConfidence
    .filter((row) => row.level === 'solid' || row.level === 'certain')
    .reduce((sum, row) => sum + row.count, 0);
  const settledShare = Math.round((settledCount / total) * 100);
  return `${capitalize(topType.type)} is your most common way of thinking here (${topType.count} of ${total}). Confidence skews toward "${topConfidence.level}," and ${settledShare}% of claims have settled into "solid" or "certain" so far.`;
}

function buildThemesReading(recurringCategories, openTensions) {
  if (recurringCategories.length === 0 && openTensions.length === 0) return null;
  const parts = [];
  if (recurringCategories.length > 0) {
    const top = recurringCategories[0];
    parts.push(
      `"${top.name}" cuts across ${top.spaceCount} Spaces -- worth noticing as a real through-line, not just per-Space organization.`
    );
  }
  if (openTensions.length > 0) {
    parts.push(
      `${openTensions.length} open Tension${openTensions.length === 1 ? '' : 's'} ${
        openTensions.length === 1 ? 'is' : 'are'
      } still unresolved.`
    );
  }
  return parts.join(' ');
}

function buildActivityReading(weeklyCounts, staleSpaces, staleThresholdDays) {
  const parts = [];
  if (weeklyCounts.length >= 2) {
    const last = weeklyCounts[weeklyCounts.length - 1].count;
    const prev = weeklyCounts[weeklyCounts.length - 2].count;
    if (last > prev) parts.push(`Activity picked up this week (${last} vs. ${prev} the week before).`);
    else if (last < prev) parts.push(`Things have gone quieter this week (${last} vs. ${prev} the week before).`);
    else parts.push(`Activity held steady week to week (${last}).`);
  }
  if (staleSpaces.length > 0) {
    parts.push(
      `${staleSpaces.length} Space${staleSpaces.length === 1 ? '' : 's'} ${
        staleSpaces.length === 1 ? 'has' : 'have'
      } gone quiet for ${staleThresholdDays}+ days.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function buildProvenanceReading(byOrigin, workItemCount, synthesisCount) {
  const totalSpaces = byOrigin.external + byOrigin.internal + byOrigin.none;
  if (totalSpaces === 0) return null;
  const parts = [];
  if (byOrigin.external + byOrigin.internal > 0) {
    const producedShare = Math.round((byOrigin.internal / totalSpaces) * 100);
    parts.push(
      producedShare >= 50
        ? `Most of what's here (${producedShare}% of Spaces) was produced by the app itself, not brought in from outside.`
        : `Most of what's here was brought in from outside -- only ${producedShare}% of Spaces were produced by the app itself.`
    );
  }
  if (workItemCount > 0) {
    const distilledShare = Math.round((synthesisCount / workItemCount) * 100);
    parts.push(
      `Roughly ${distilledShare}% as many Syntheses exist as raw Work items -- most thinking is still scattered claims waiting to be pulled together.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function buildTimeReading(overdueSpaceCount, overdueMilestoneCount, milestoneTotal, reachedCount, completedSessionCount, totalMinutesLogged) {
  const parts = [];
  const overdueTotal = overdueSpaceCount + overdueMilestoneCount;
  if (overdueTotal > 0) {
    parts.push(
      `${overdueTotal} thing${overdueTotal === 1 ? ' is' : 's are'} overdue (${overdueSpaceCount} Space due date${
        overdueSpaceCount === 1 ? '' : 's'
      }, ${overdueMilestoneCount} Milestone${overdueMilestoneCount === 1 ? '' : 's'}).`
    );
  }
  if (milestoneTotal > 0) {
    parts.push(`${reachedCount} of ${milestoneTotal} Milestones reached so far.`);
  }
  if (completedSessionCount > 0) {
    parts.push(
      `${totalMinutesLogged} minutes of focused work logged across ${completedSessionCount} Session${
        completedSessionCount === 1 ? '' : 's'
      }.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

export async function getWorkMixInsights(env) {
  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(`SELECT type, content FROM blocks WHERE type IN (${placeholders}) AND space_id != ?`)
    .bind(...WORK_TYPES, TEST_SPACE_ID)
    .all();

  const typeCounts = {};
  const confidenceCounts = {};
  results.forEach((row) => {
    typeCounts[row.type] = (typeCounts[row.type] || 0) + 1;
    const { confidence } = JSON.parse(row.content);
    const level = confidence || 'tentative';
    confidenceCounts[level] = (confidenceCounts[level] || 0) + 1;
  });

  const byType = WORK_TYPES.map((type) => ({ type, count: typeCounts[type] || 0 }));
  const byConfidence = CONFIDENCE_LEVELS.map((level) => ({ level, count: confidenceCounts[level] || 0 }));
  return {
    total: results.length,
    byType,
    byConfidence,
    reading: buildWorkMixReading(results.length, byType, byConfidence),
  };
}

export async function getThemeInsights(env) {
  const spaceRows = await env.DB.prepare(`SELECT id, title, categories FROM spaces WHERE id != ?`).bind(TEST_SPACE_ID).all();

  const categoryToTitles = new Map();
  spaceRows.results.forEach((row) => {
    JSON.parse(row.categories || '[]').forEach((name) => {
      if (!categoryToTitles.has(name)) categoryToTitles.set(name, new Set());
      categoryToTitles.get(name).add(row.title);
    });
  });
  const recurringCategories = [...categoryToTitles.entries()]
    .filter(([, titles]) => titles.size > 1)
    .map(([name, titles]) => ({ name, spaceCount: titles.size, spaceTitles: [...titles] }))
    .sort((a, b) => b.spaceCount - a.spaceCount);

  const tensionRows = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.space_id, spaces.title AS space_title, blocks.content
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'list' AND json_extract(blocks.properties, '$.skeletonLane') = 'tensions'
       AND blocks.space_id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const openTensions = tensionRows.results.flatMap((row) => {
    const content = JSON.parse(row.content);
    return (content.items || []).map((item) => ({
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      blockId: row.block_id,
      label: item.text,
    }));
  });

  return {
    recurringCategories,
    openTensionCount: openTensions.length,
    openTensions,
    reading: buildThemesReading(recurringCategories, openTensions),
  };
}

export async function getActivityTrendInsights(env, weeks = 8) {
  const weeklyCounts = await env.DB.prepare(
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
    .bind(TEST_SPACE_ID, `-${weeks * 7} days`)
    .all();

  const staleThresholdDays = 30;
  const staleSpaces = await env.DB.prepare(
    `SELECT id, title, updated_at,
            CAST(julianday('now') - julianday(updated_at) AS INTEGER) AS days_since_update
     FROM spaces
     WHERE id != ? AND julianday('now') - julianday(updated_at) > ?
     ORDER BY updated_at ASC`
  )
    .bind(TEST_SPACE_ID, staleThresholdDays)
    .all();

  const staleSpacesOut = staleSpaces.results.map((row) => ({ id: row.id, title: row.title, daysSinceUpdate: row.days_since_update }));
  return {
    weeklyCounts: weeklyCounts.results,
    staleThresholdDays,
    staleSpaces: staleSpacesOut,
    reading: buildActivityReading(weeklyCounts.results, staleSpacesOut, staleThresholdDays),
  };
}

export async function getProvenanceInsights(env) {
  const originRows = await env.DB.prepare(`SELECT origin, COUNT(*) AS count FROM spaces WHERE id != ? GROUP BY origin`)
    .bind(TEST_SPACE_ID)
    .all();
  const byOrigin = { external: 0, internal: 0, none: 0 };
  originRows.results.forEach((row) => {
    if (row.origin === 'external') byOrigin.external = row.count;
    else if (row.origin === 'internal') byOrigin.internal = row.count;
    else byOrigin.none = row.count;
  });

  const synthesisCount = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM spaces
     WHERE id != ? AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'synthesis')`
  )
    .bind(TEST_SPACE_ID)
    .first();
  const promotedCount = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM spaces
     WHERE id != ?
       AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'synthesis')
       AND EXISTS (SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = 'resource')`
  )
    .bind(TEST_SPACE_ID)
    .first();

  const placeholders = WORK_TYPES.map(() => '?').join(', ');
  const workItemCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE type IN (${placeholders}) AND space_id != ?`)
    .bind(...WORK_TYPES, TEST_SPACE_ID)
    .first();

  return {
    byOrigin,
    synthesisCount: synthesisCount.count,
    promotedCount: promotedCount.count,
    workItemCount: workItemCount.count,
    reading: buildProvenanceReading(byOrigin, workItemCount.count, synthesisCount.count),
  };
}

export async function getTimeInsights(env) {
  const today = todayString();

  const dueDateRows = await env.DB.prepare(`SELECT id, title, due_date FROM spaces WHERE id != ? AND due_date IS NOT NULL ORDER BY due_date ASC`)
    .bind(TEST_SPACE_ID)
    .all();
  const overdueSpaces = dueDateRows.results.filter((row) => row.due_date < today);
  const upcomingSpaces = dueDateRows.results.filter((row) => row.due_date >= today);

  const milestoneRows = await env.DB.prepare(
    `SELECT blocks.id AS block_id, blocks.content AS content, spaces.id AS space_id, spaces.title AS space_title
     FROM blocks JOIN spaces ON spaces.id = blocks.space_id
     WHERE blocks.type = 'milestone' AND blocks.space_id != ?`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const milestones = milestoneRows.results.map((row) => ({
    ...JSON.parse(row.content),
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    blockId: row.block_id,
  }));
  const reachedCount = milestones.filter((milestone) => milestone.reached).length;
  const overdueMilestones = milestones.filter(
    (milestone) => !milestone.reached && milestone.targetDate && milestone.targetDate < today
  );

  const sessionRows = await env.DB.prepare(`SELECT content FROM blocks WHERE type = 'session' AND space_id != ?`)
    .bind(TEST_SPACE_ID)
    .all();
  const sessions = sessionRows.results.map((row) => JSON.parse(row.content));
  const completedSessions = sessions.filter((session) => session.endedAt);
  const totalMinutesLogged = completedSessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
  const runningCount = sessions.filter((session) => session.startedAt && !session.endedAt).length;

  const reviewStaleThresholdDays = 14;
  const reviewedRows = await env.DB.prepare(
    `SELECT trail_entries.space_id AS id, spaces.title AS title,
            MAX(trail_entries.created_at) AS last_reviewed,
            CAST(julianday('now') - julianday(MAX(trail_entries.created_at)) AS INTEGER) AS days_since
     FROM trail_entries
     JOIN spaces ON spaces.id = trail_entries.space_id
     WHERE trail_entries.kind = 'review' AND spaces.id != ?
     GROUP BY trail_entries.space_id`
  )
    .bind(TEST_SPACE_ID)
    .all();
  const reviewedSpaceIds = new Set(reviewedRows.results.map((row) => row.id));
  const allSpaces = await env.DB.prepare(`SELECT id, title FROM spaces WHERE id != ?`).bind(TEST_SPACE_ID).all();
  const neverReviewed = allSpaces.results.filter((space) => !reviewedSpaceIds.has(space.id));
  const staleReviews = reviewedRows.results
    .filter((row) => row.days_since > reviewStaleThresholdDays)
    .sort((a, b) => b.days_since - a.days_since);

  return {
    dueDates: { overdue: overdueSpaces, upcoming: upcomingSpaces.slice(0, 5) },
    milestones: { total: milestones.length, reachedCount, overdueMilestones },
    sessions: { completedCount: completedSessions.length, totalMinutesLogged, runningCount },
    review: { neverReviewed, staleReviews, reviewStaleThresholdDays },
    reading: buildTimeReading(
      overdueSpaces.length,
      overdueMilestones.length,
      milestones.length,
      reachedCount,
      completedSessions.length,
      totalMinutesLogged
    ),
  };
}
