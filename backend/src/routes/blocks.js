import { Router } from 'express';
import {
  listBlocksForSpace,
  getBlockById,
  updateBlockContent,
  updateBlockCategories,
  updateBlockWorkspaces,
  updateBlockProject,
  saveTextBlockWithPromotion,
  addBlockToSpace,
  deleteBlock,
  moveBlockInSpace,
  getBlockReport,
} from '../db/queries.js';
import { renderReportText } from '../reportFormat.js';

export const blocksRouter = Router();

blocksRouter.get('/spaces/:spaceId/blocks', (req, res) => {
  res.json(listBlocksForSpace(req.params.spaceId));
});

// Adding a block to an already-live Space -- the same ordinary action
// as adding one via a Template, just one at a time and later.
blocksRouter.post('/spaces/:spaceId/blocks', (req, res) => {
  const { type, content, properties } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }
  res.status(201).json(addBlockToSpace(req.params.spaceId, { type, content, properties }));
});

blocksRouter.post('/spaces/:spaceId/blocks/:blockId/move', (req, res) => {
  const { direction } = req.body;
  if (direction !== -1 && direction !== 1) {
    return res.status(400).json({ error: 'direction must be -1 or 1' });
  }
  moveBlockInSpace(req.params.spaceId, req.params.blockId, direction);
  res.json(listBlocksForSpace(req.params.spaceId));
});

// content, categories, workspaces, and projectId are all independent
// edits (content vs. three different properties), so any subset can be
// sent together.
blocksRouter.patch('/blocks/:id', (req, res) => {
  const existing = getBlockById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  const { content, categories, workspaces, projectId } = req.body;
  if (content === undefined && categories === undefined && workspaces === undefined && projectId === undefined) {
    return res.status(400).json({ error: 'content, categories, workspaces, or projectId is required' });
  }
  let updated = existing;
  if (content !== undefined) {
    updated = updateBlockContent(req.params.id, content);
  }
  if (categories !== undefined) {
    updated = updateBlockCategories(req.params.id, categories);
  }
  if (workspaces !== undefined) {
    updated = updateBlockWorkspaces(req.params.id, workspaces);
  }
  if (projectId !== undefined) {
    updated = updateBlockProject(req.params.id, projectId);
  }
  res.json(updated);
});

blocksRouter.delete('/blocks/:id', (req, res) => {
  deleteBlock(req.params.id);
  res.status(204).end();
});

// A structured + prose snapshot of this one Tool/Work item's current
// state -- see getBlockReport in queries.js. Covers every Block type
// uniformly, a Hypothesis included.
blocksRouter.get('/blocks/:id/report', (req, res) => {
  const report = getBlockReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json({ report, narrative: renderReportText(report) });
});

// Text blocks go through their own route, not the generic PATCH above,
// because saving one also has to check for [[=?!]] shorthand and
// promote it into the Skeleton -- see saveTextBlockWithPromotion. Takes
// the block's whole new `lines` array (each {id, text, tag}), not a
// single string -- per-line attribution needs each line's own identity
// preserved across a save, not just the joined text.
blocksRouter.patch('/blocks/:id/text', (req, res) => {
  const existing = getBlockById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  const { lines } = req.body;
  if (!Array.isArray(lines)) {
    return res.status(400).json({ error: 'lines is required' });
  }
  res.json(saveTextBlockWithPromotion(req.params.id, lines));
});
