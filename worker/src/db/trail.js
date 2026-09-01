// Ported from backend/src/db/queries/trail.js.
//
// NOTE on the trail.js <-> skeleton.js circular import: see the matching
// note at the top of skeleton.js. Safe under the Workers runtime's ESM
// module system for the same reason it's safe in Node -- every
// cross-reference here happens inside a function body, called lazily at
// request time, never at module-top-level evaluation.

import { getSkeletonSnapshot } from './skeleton.js';

export function parseTrailRow(row) {
  return { ...row, skeleton_snapshot: JSON.parse(row.skeleton_snapshot) };
}

export async function logTrailEntry(env, { spaceId, kind, summary, note = null }) {
  const id = crypto.randomUUID();
  const snapshot = await getSkeletonSnapshot(env, spaceId);
  await env.DB.prepare(
    `INSERT INTO trail_entries (id, space_id, kind, summary, note, skeleton_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, spaceId, kind, summary, note, JSON.stringify(snapshot))
    .run();
  const row = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  return parseTrailRow(row);
}

function truncateForSummary(text) {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export async function addManualTrailEntry(env, spaceId, note) {
  return logTrailEntry(env, { spaceId, kind: 'manual', summary: truncateForSummary(note), note });
}

export async function listTrailEntries(env, spaceId) {
  const { results } = await env.DB.prepare(`SELECT * FROM trail_entries WHERE space_id = ? ORDER BY created_at ASC`)
    .bind(spaceId)
    .all();
  return results.map(parseTrailRow);
}

// For a manual entry, note *is* its own text, so its summary (the
// truncated preview the Log page shows) is recomputed to match; an
// auto/review entry's summary is left alone.
export async function updateTrailEntry(env, id, note) {
  const existing = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  if (!existing) return null;
  const summary = existing.kind === 'manual' ? truncateForSummary(note) : existing.summary;
  await env.DB.prepare(`UPDATE trail_entries SET note = ?, summary = ? WHERE id = ?`).bind(note, summary, id).run();
  const row = await env.DB.prepare(`SELECT * FROM trail_entries WHERE id = ?`).bind(id).first();
  return parseTrailRow(row);
}
