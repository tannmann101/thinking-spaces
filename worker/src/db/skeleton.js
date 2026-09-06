// --- Skeleton ---------------------------------------------------------
// "The Skeleton" isn't a new schema concept: it's four List blocks (the
// lanes) plus one Text block (Current Best Articulation), distinguished
// from any other block only by a marker in `properties`. This is the
// one place that marker convention is defined.
//
// Evidence has no shorthand trigger in the Tools & Resources doc (only
// Premises/Open Questions/Tensions do), and there's no "add an item"
// UI yet for List blocks -- so the Evidence lane exists but currently
// has no way to ever gain its first item. That's a known gap, not an
// oversight.
//
// NOTE: every updateBlockContent call in this file passes
// `{ logEdit: false }` -- each of these functions writes its own Trail
// entry describing the same change, and letting updateBlockContent
// record it too would report one action twice.
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

// --- Skeleton ---------------------------------------------------------
// "The Skeleton" isn't a new schema concept: it's four List blocks (the
// lanes) plus one Text block (Current Best Articulation), distinguished
// from any other block only by a marker in `properties`. This is the
// one place that marker convention is defined.
//
// Evidence has no shorthand trigger in the Tools & Resources doc (only
// Premises/Open Questions/Tensions do), and there's no "add an item"
// UI yet for List blocks -- so the Evidence lane exists but currently
// has no way to ever gain its first item. That's a known gap, not an
// oversight.
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
// Current Best Articulation block don't already exist yet. Safe to
// call every time something is about to be promoted into a Skeleton.
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

// Saves a Text block's new lines, but first pulls out any `=`/`?`/`!`
// shorthand lines and appends them as new items (default confidence:
// tentative) in the matching Skeleton lane -- "parsed ... promoted into
// the Skeleton without leaving the surface." Promotion happens on save,
// not per keystroke; the end state is the same, this is just simpler
// and doesn't risk editing text out from under someone mid-keystroke.
// Deliberately different from fileLineInLane below (the select-and-tap
// capture path), which copies a line into a lane and leaves it in the
// Writing Surface untouched -- shorthand is a promotion, this isn't.
export async function saveTextBlockWithPromotion(env, blockId, newLines) {
  const block = await getBlockById(env, blockId);
  const { keptLines, promotions } = extractPromotions(newLines);

  if (promotions.length > 0) {
    await ensureSkeletonLanes(env, block.space_id);
    for (const { laneKey, text } of promotions) {
      const lane = await findSkeletonLaneBlock(env, block.space_id, laneKey);
      const newItem = { id: crypto.randomUUID(), text, confidence: 'tentative' };
      await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] }, { logEdit: false });
    }
  }

  const updated = await updateBlockContent(env, blockId, { lines: keptLines }, { logEdit: false });

  // changeSummary surfaces the promotion (this app's own "invisible
  // magic") as a toast, not
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
// into a lane copies it in as a new tentative item and leaves the
// Writing Surface's own line untouched -- "structuring something
// already down," deliberately different from typed =/?/! shorthand
// (saveTextBlockWithPromotion above), which promotes and removes.
export async function fileLineInLane(env, spaceId, laneKey, text) {
  await ensureSkeletonLanes(env, spaceId);
  const lane = await findSkeletonLaneBlock(env, spaceId, laneKey);
  const newItem = { id: crypto.randomUUID(), text, confidence: 'tentative' };
  const updated = await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] }, { logEdit: false });
  const summary = `Filed into ${lane.content.laneLabel}`;
  await logTrailEntry(env, { spaceId, kind: 'auto', summary });
  return { ...updated, changeSummary: summary };
}

// A Tension is created explicitly by pairing two specific existing
// statements -- from any of the three claim-bearing lanes, never the
// Tensions lane itself -- and never inferred automatically. The pair
// lives on the Tensions-lane item itself (statementA/statementB, each a
// {blockId, itemId} pointer resolved live by the frontend against
// already-fetched block data) rather than a separate table, so a
// Tension stays an ordinary Tensions-lane item everywhere else in the
// app -- confidence cycling, removal, and so on all keep working
// unchanged; it just carries two extra pointers this one lane's items
// uniquely use.
export async function createTensionPair(env, spaceId, { label, statementA, statementB }) {
  await ensureSkeletonLanes(env, spaceId);
  const lane = await findSkeletonLaneBlock(env, spaceId, 'tensions');
  const newItem = { id: crypto.randomUUID(), text: label, confidence: 'tentative', statementA, statementB };
  const updated = await updateBlockContent(env, lane.id, { ...lane.content, items: [...lane.content.items, newItem] }, { logEdit: false });
  const summary = `Tension paired: "${label}" -- now counted as an open Tension in Insights`;
  await logTrailEntry(env, { spaceId, kind: 'auto', summary: `Tension created: "${label}"` });
  return { ...updated, changeSummary: summary };
}

// The Skeleton's current live state, shaped identically to a stored
// Trail snapshot (see trail.js's logTrailEntry) -- moved here from its
// original spot physically grouped under "--- Trail ---" in the old
// single-file queries.js, since reading the Skeleton is this module's
// own concern, not Trail's. trail.js imports this to build a snapshot;
// it's also how Rewind's "Now" column gets the live Skeleton state, in
// the exact same shape a stored snapshot has, so both sides of a
// Now-vs-As-of comparison render through one function instead of two
// independent readings of the same data. Includes each lane's actual
// laneLabel (not just its items), since a Space Type can relabel lanes
// (e.g. Person-Reflection's "What I Understand" instead of "Premises").
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
