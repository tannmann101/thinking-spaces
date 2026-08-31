import { Router } from 'express';
import {
  listBlocksForSpace,
  getBlockById,
  updateBlockContent,
  updateBlockCategories,
  updateBlockWorkspaces,
  saveTextBlockWithPromotion,
  addBlockToSpace,
  deleteBlock,
  moveBlockInSpace,
} from '../db/queries.js';

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

// content, categories, and workspaces are all independent edits (content
// vs. two different properties), so any subset can be sent together.
blocksRouter.patch('/blocks/:id', (req, res) => {
  const existing = getBlockById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Block not found' });
  }
  const { content, categories, workspaces } = req.body;
  if (content === undefined && categories === undefined && workspaces === undefined) {
    return res.status(400).json({ error: 'content, categories, or workspaces is required' });
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
  res.json(updated);
});

blocksRouter.delete('/blocks/:id', (req, res) => {
  deleteBlock(req.params.id);
  res.status(204).end();
});

// Text blocks go through their own route, not the generic PATCH above,
// because saving one also has to check for [[=?!]] shorthand and
// promote it into the Skeleton -- see saveTextBlockWithPromotion.
blocksRouter.patch('/blocks/:id/text', (req, res) => {
  const existing = getBlockById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Block not found' });
  }
  const { text } = req.body;
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  res.json(saveTextBlockWithPromotion(req.params.id, text));
});
