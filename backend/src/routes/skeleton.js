// Skeleton-specific routes: the two capture paths that don't fit the
// generic block PATCH -- filing an already-written line into a lane
// (a copy, not a promotion -- see fileLineInLane in db/queries.js) and
// creating a paired Tension between two specific existing statements
// (see createTensionPair). Typed =/?/! shorthand promotion still goes
// through the ordinary text-save route in blocks.js. Also the live
// "Now" reading Trail's Rewind compares an As-of snapshot against --
// see getSkeletonSnapshot in db/queries.js, the same function a Trail
// entry's own stored snapshot was built from.

import { Router } from 'express';
import { fileLineInLane, createTensionPair, getSkeletonSnapshot, listAllSkeletonClaims, SKELETON_LANES } from '../db/queries.js';

export const skeletonRouter = Router();

const LANE_KEYS = new Set(SKELETON_LANES.map((lane) => lane.key));
// A Tension pairs two claim-bearing statements -- never another
// Tension, which wouldn't mean anything to pair against.
const CLAIM_LANE_KEYS = new Set(LANE_KEYS);
CLAIM_LANE_KEYS.delete('tensions');

skeletonRouter.post('/spaces/:id/skeleton/file', (req, res) => {
  const { laneKey, text } = req.body;
  if (!CLAIM_LANE_KEYS.has(laneKey)) {
    return res.status(400).json({ error: 'laneKey must be premises, evidence, or open-questions' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  res.status(201).json(fileLineInLane(req.params.id, laneKey, text.trim()));
});

skeletonRouter.get('/spaces/:id/skeleton/current', (req, res) => {
  res.json(getSkeletonSnapshot(req.params.id));
});

// Cross-Space browsing of claim-bearing Skeleton lane items -- powers a
// Work item's "Link a claim" picker once it can point at a claim
// outside its own Space, same reasoning /work-items (work.js) exists.
skeletonRouter.get('/skeleton-claims', (req, res) => {
  res.json(listAllSkeletonClaims());
});

skeletonRouter.post('/spaces/:id/skeleton/tensions', (req, res) => {
  const { label, statementA, statementB } = req.body;
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  for (const [name, statement] of [['statementA', statementA], ['statementB', statementB]]) {
    if (!statement || !statement.blockId || !statement.itemId) {
      return res.status(400).json({ error: `${name} must have a blockId and itemId` });
    }
  }
  res.status(201).json(createTensionPair(req.params.id, { label: label.trim(), statementA, statementB }));
});
