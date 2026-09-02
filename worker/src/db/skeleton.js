// Ported from backend/src/db/queries/skeleton.js.
//
// NOTE on the skeleton.js <-> trail.js circular import: this module
// calls logTrailEntry (trail.js) from inside saveTextBlockWithPromotion/
// fileLineInLane/createTensionPair, and trail.js calls
// getSkeletonSnapshot (this module) from inside logTrailEntry. A genuine
// mutual dependency, not an accident -- see trail.js's own note. Safe
// under the Workers runtime's ESM module system the same way it's safe
// in Node: every cross-reference happens inside a function body, called
// lazily, never at module-load time.

import { listBlocksForSpace, createBlock, updateBlockContent, getBlockById, nextPosition } from './blocks.js';
import { logTrailEntry } from './trail.js';
import { TEST_SPACE_ID } from './constants.js';

export const SKELETON_LANES = [
  { key: 'premises', label: 'Premises', trigger: '=' },
  { key: 'evidence', label: 'Evidence', trigger: null },
  { key: 'open-questions', label: 'Open Questions', trigger: '?' },
  { key: 'tensions', label: 'Tensions', trigger: '!' },
];

async function findSkeletonLaneBlock(env, spaceId, laneKey) {
  const blocks = await listBlocksForSpace(env, spaceId);
  return blocks.find((block) => block.type === 'list' && block.properties.skeletonLane === laneKey);
}

// Idempotent per Space: creates whichever of the four lanes and the
// Current Best Articulation block don't already exist yet.
export async function ensureSkeletonLanes(env, spaceId) {
  for (const lane of SKELETON_LANES) {
    if (await findSkeletonLaneBlock(env, spaceId, lane.key)) continue;
    await createBlock(env, {
      spaceId,
      type: 'list',
      content: { items: [], laneLabel: lane.label },
      properties: { skeletonLane: lane.key },
      position: await nextPosition(env, spaceId),
    });
  }

  const blocks = await listBlocksForSpace(env, spaceId);
  const hasArticulation = blocks.some(
    (block) => block.type === 'text' && block.properties.skeletonRole === 'current-best-articulation'
  );
  if (!hasArticulation) {
    await createBlock(env, {
      spaceId,
      type: 'text',
      content: { tag: null, text: '' },
      properties: { skeletonRole: 'current-best-articulation' },
      position: await nextPosition(env, spaceId),
    });
  }
}

const PROMOTION_TRIGGERS = new Map(SKELETON_LANES.filter((lane) => lane.trigger).map((lane) => [lane.trigger, lane.key]));

function extractPromotions(lines) {
  const keptLines = [];
  const promotions = [];
  for (const line of lines) {
    const trimmed = line.text.trim();
    const trigger = trimmed.charAt(0);
    const laneKey = PROMOTION_TRIGGERS.get(trigger);
    if (laneKey && trimmed.slice(1).trim()) {
      promotions.push({ laneKey, text: trimmed.slice(1).trim() });
    } else {
      keptLines.push(line);
    }
  }
  return { keptLines, promotions };
}

export async function saveTextBlockWithPromotion(env, blockId, newLines) {
  const block = await getBlockById(env, blockId);
  const { keptLines, promotions } = extractPromotions(newLines);

  if (promotions.length > 0) {
    await ensureSkeletonLanes(env, block.space_id);
    for (const { laneKey, text } of promotions) {
      const lane = await findSkeletonLaneBlock(env, block.space_id, laneKey);
      const newItem = { id: crypto.randomUUID(), text, confidence: 'tentative' };
      await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
    }
  }

  const updated = await updateBlockContent(env, blockId, { lines: keptLines });

  // changeSummary surfaces the promotion (this app's own "invisible
  // magic" -- see backend/src/db/queries/skeleton.js) as a toast, not
  // just a Trail entry someone would have to navigate away to see.
  let changeSummary = null;
  if (promotions.length > 0) {
    const laneLabelByKey = new Map(SKELETON_LANES.map((lane) => [lane.key, lane.label]));
    const counts = new Map();
    promotions.forEach(({ laneKey }) => counts.set(laneKey, (counts.get(laneKey) || 0) + 1));
    const breakdown = [...counts.entries()].map(([laneKey, count]) => `${count} ${laneLabelByKey.get(laneKey)}`).join(', ');
    changeSummary = `Promoted: ${breakdown}`;
    await logTrailEntry(env, { spaceId: block.space_id, kind: 'auto', summary: changeSummary });
  } else if (block.properties.skeletonRole === 'current-best-articulation') {
    const oldText = (block.content.lines || []).map((line) => line.text).join('\n');
    const newText = keptLines.map((line) => line.text).join('\n');
    if (newText !== oldText) {
      changeSummary = 'Updated Current Best Articulation';
      await logTrailEntry(env, { spaceId: block.space_id, kind: 'auto', summary: changeSummary });
    }
  }

  return changeSummary ? { ...updated, changeSummary } : updated;
}

// The Skeleton's alternate capture path: filing an already-written line
// into a lane copies it as a new tentative item and leaves the Writing
// Surface's own line untouched.
export async function fileLineInLane(env, spaceId, laneKey, text) {
  await ensureSkeletonLanes(env, spaceId);
  const lane = await findSkeletonLaneBlock(env, spaceId, laneKey);
  const newItem = { id: crypto.randomUUID(), text, confidence: 'tentative' };
  const updated = await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
  const summary = `Filed into ${lane.content.laneLabel}`;
  await logTrailEntry(env, { spaceId, kind: 'auto', summary });
  return { ...updated, changeSummary: summary };
}

export async function createTensionPair(env, spaceId, { label, statementA, statementB }) {
  await ensureSkeletonLanes(env, spaceId);
  const lane = await findSkeletonLaneBlock(env, spaceId, 'tensions');
  const newItem = { id: crypto.randomUUID(), text: label, confidence: 'tentative', statementA, statementB };
  const updated = await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
  const summary = `Tension paired: "${label}" -- now counted as an open Tension in Insights`;
  await logTrailEntry(env, { spaceId, kind: 'auto', summary: `Tension created: "${label}"` });
  return { ...updated, changeSummary: summary };
}

// The Skeleton's current live state, shaped identically to a stored
// Trail snapshot -- trail.js imports this to build a snapshot; it's
// also how Rewind's "Now" column gets the live Skeleton state.
export async function getSkeletonSnapshot(env, spaceId) {
  const blocks = await listBlocksForSpace(env, spaceId);
  const lanes = {};
  SKELETON_LANES.forEach((lane) => {
    const block = blocks.find((b) => b.type === 'list' && b.properties.skeletonLane === lane.key);
    lanes[lane.key] = {
      label: block ? block.content.laneLabel : lane.label,
      items: block ? block.content.items : [],
    };
  });
  const articulationBlock = blocks.find(
    (b) => b.type === 'text' && b.properties.skeletonRole === 'current-best-articulation'
  );
  const articulation = articulationBlock ? (articulationBlock.content.lines || []).map((line) => line.text).join('\n') : '';
  return { lanes, articulation };
}

// A support point's "Link a claim" picker needs candidates from every
// Space, not just the current one -- same reasoning listWorkItems()
// (work.js) is cross-Space. Only the three claim-bearing lanes count
// (Tensions itself isn't a claim to link to).
const CLAIM_LANE_KEYS = SKELETON_LANES.filter((lane) => lane.key !== 'tensions').map((lane) => lane.key);

export async function listAllSkeletonClaims(env) {
  const placeholders = CLAIM_LANE_KEYS.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT spaces.id AS space_id, spaces.title AS space_title, blocks.id AS block_id,
            json_extract(blocks.content, '$.laneLabel') AS lane_label, item.value AS item_json
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     JOIN json_each(blocks.content, '$.items') AS item
     WHERE blocks.type = 'list'
       AND json_extract(blocks.properties, '$.skeletonLane') IN (${placeholders})
       AND spaces.id != ?
     ORDER BY spaces.title ASC`
  )
    .bind(...CLAIM_LANE_KEYS, TEST_SPACE_ID)
    .all();
  return results.map((row) => {
    const item = JSON.parse(row.item_json);
    return {
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      blockId: row.block_id,
      itemId: item.id,
      text: item.text,
      laneLabel: row.lane_label,
    };
  });
}
