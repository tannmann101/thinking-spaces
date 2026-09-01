import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { listBlocksForSpace, createBlock, updateBlockContent, getBlockById, nextPosition } from './blocks.js';
import { normalizeTextContent } from './normalize.js';
import { logTrailEntry } from './trail.js';

// NOTE on the skeleton.js <-> trail.js circular import: this module
// calls logTrailEntry (trail.js) from inside saveTextBlockWithPromotion/
// fileLineInLane/createTensionPair, and trail.js calls getSkeletonSnapshot
// (this module) from inside logTrailEntry. That's a genuine mutual
// dependency, not an accident -- a Trail entry always needs to snapshot
// the Skeleton, and a Skeleton edit always needs to log its own Trail
// entry. Both are conceptually separate (Skeleton is the four Lanes +
// Current Best Articulation; Trail is the history layer over the whole
// Space), so merging them into one file would blur that distinction for
// no real gain. This is safe in Node's ESM module system because every
// cross-reference here happens inside a function body, called lazily at
// runtime -- never at module-top-level evaluation time -- so there's no
// "which file loads first" problem.

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

function findSkeletonLaneBlock(spaceId, laneKey) {
  return listBlocksForSpace(spaceId).find(
    (block) => block.type === 'list' && block.properties.skeletonLane === laneKey
  );
}

// Idempotent per Space: creates whichever of the four lanes and the
// Current Best Articulation block don't already exist yet. Safe to
// call every time something is about to be promoted into a Skeleton.
export function ensureSkeletonLanes(spaceId) {
  SKELETON_LANES.forEach((lane) => {
    if (findSkeletonLaneBlock(spaceId, lane.key)) return;
    createBlock({
      spaceId,
      type: 'list',
      content: { items: [], laneLabel: lane.label },
      properties: { skeletonLane: lane.key },
      position: nextPosition(spaceId),
    });
  });

  const hasArticulation = listBlocksForSpace(spaceId).some(
    (block) => block.type === 'text' && block.properties.skeletonRole === 'current-best-articulation'
  );
  if (!hasArticulation) {
    createBlock({
      spaceId,
      type: 'text',
      content: { tag: null, text: '' },
      properties: { skeletonRole: 'current-best-articulation' },
      position: nextPosition(spaceId),
    });
  }
}

const PROMOTION_TRIGGERS = new Map(
  SKELETON_LANES.filter((lane) => lane.trigger).map((lane) => [lane.trigger, lane.key])
);

// Splits a Text block's lines into (a) the lines that stay as prose and
// (b) any lines recognized as Skeleton shorthand, each tagged with
// which lane it promotes to. Each surviving line keeps its own id and
// tag intact -- this only ever removes whole lines, never rewrites one.
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
export function saveTextBlockWithPromotion(blockId, newLines) {
  const block = getBlockById(blockId);
  const { keptLines, promotions } = extractPromotions(newLines);

  if (promotions.length > 0) {
    ensureSkeletonLanes(block.space_id);
    promotions.forEach(({ laneKey, text }) => {
      const lane = findSkeletonLaneBlock(block.space_id, laneKey);
      const newItem = { id: randomUUID(), text, confidence: 'tentative' };
      updateBlockContent(lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
    });
  }

  const updated = updateBlockContent(blockId, { lines: keptLines });

  // Log a Trail entry for whichever structural change just happened --
  // items promoted into lanes, or (if this was the articulation block
  // itself) its text changing. Both count as "a Skeleton structural
  // change" per the doc; an edit that's neither doesn't get logged.
  if (promotions.length > 0) {
    const laneLabelByKey = new Map(SKELETON_LANES.map((lane) => [lane.key, lane.label]));
    const counts = new Map();
    promotions.forEach(({ laneKey }) => counts.set(laneKey, (counts.get(laneKey) || 0) + 1));
    const summary = [...counts.entries()]
      .map(([laneKey, count]) => `${count} ${laneLabelByKey.get(laneKey)}`)
      .join(', ');
    logTrailEntry({ spaceId: block.space_id, kind: 'auto', summary: `Promoted: ${summary}` });
  } else if (block.properties.skeletonRole === 'current-best-articulation') {
    const oldText = (block.content.lines || []).map((line) => line.text).join('\n');
    const newText = keptLines.map((line) => line.text).join('\n');
    if (newText !== oldText) {
      logTrailEntry({ spaceId: block.space_id, kind: 'auto', summary: 'Updated Current Best Articulation' });
    }
  }

  return updated;
}

// One-time content migration: a Text block used to carry one
// `{tag, text}` for its whole self; per-line attribution (see
// TextWorkshop.jsx) needs each line to carry its own tag and a stable
// id, so this splits any block still on the old shape into `lines`,
// one per newline-separated line, all initially carrying the block's
// old tag (the closest available default -- there's no way to know
// which specific line that tag was really about). A block already on
// the new shape (has `content.lines`) is left untouched, so this is
// safe to run on every startup. Comparison's embedded "text-kind" sides
// are never touched -- they live inside a `comparison` block's own
// content, not as their own `type = 'text'` row, and deliberately keep
// the old single-tag shape (see TextBlock.jsx).
export function migrateTextBlockLines() {
  const rows = db.prepare(`SELECT id, content FROM blocks WHERE type = 'text'`).all();
  rows.forEach((row) => {
    const content = JSON.parse(row.content);
    if (content.lines) return;
    db.prepare(`UPDATE blocks SET content = ? WHERE id = ?`).run(
      JSON.stringify(normalizeTextContent(content)),
      row.id
    );
  });
}

// The Skeleton's alternate capture path: filing an already-written line
// into a lane copies it in as a new tentative item and leaves the
// Writing Surface's own line untouched -- "structuring something
// already down," deliberately different from typed =/?/! shorthand
// (saveTextBlockWithPromotion above), which promotes and removes.
export function fileLineInLane(spaceId, laneKey, text) {
  ensureSkeletonLanes(spaceId);
  const lane = findSkeletonLaneBlock(spaceId, laneKey);
  const newItem = { id: randomUUID(), text, confidence: 'tentative' };
  const updated = updateBlockContent(lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
  logTrailEntry({ spaceId, kind: 'auto', summary: `Filed into ${lane.content.laneLabel}` });
  return updated;
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
export function createTensionPair(spaceId, { label, statementA, statementB }) {
  ensureSkeletonLanes(spaceId);
  const lane = findSkeletonLaneBlock(spaceId, 'tensions');
  const newItem = { id: randomUUID(), text: label, confidence: 'tentative', statementA, statementB };
  const updated = updateBlockContent(lane.id, { ...lane.content, items: [...lane.content.items, newItem] });
  logTrailEntry({ spaceId, kind: 'auto', summary: `Tension created: "${label}"` });
  return updated;
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
export function getSkeletonSnapshot(spaceId) {
  const blocks = listBlocksForSpace(spaceId);
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
  // Found by this project's first backend test suite, not by inspection:
  // this used to read articulationBlock.content.text directly, a field
  // that stopped existing the moment Text blocks were migrated to their
  // current {lines: [...]} shape (see the Tools vocabulary entry in
  // CLAUDE.md) -- every Trail snapshot taken since then silently
  // recorded an empty Current Best Articulation, no matter what was
  // actually written. Rejoining the lines with '\n' matches the same
  // join saveTextBlockWithPromotion above already uses to compare old
  // vs. new articulation text.
  const articulation = articulationBlock ? (articulationBlock.content.lines || []).map((line) => line.text).join('\n') : '';
  return { lanes, articulation };
}
