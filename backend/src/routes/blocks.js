import { Router } from 'express';
import {
  listBlocksForSpace,
  getBlockById,
  updateBlockContent,
  saveTextBlockWithPromotion,
} from '../db/queries.js';

export const blocksRouter = Router();

blocksRouter.get('/spaces/:spaceId/blocks', (req, res) => {
  res.json(listBlocksForSpace(req.params.spaceId));
});

blocksRouter.patch('/blocks/:id', (req, res) => {
  const existing = getBlockById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Block not found' });
  }
  const { content } = req.body;
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ error: 'content is required' });
  }
  res.json(updateBlockContent(req.params.id, content));
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
