import { Router } from 'express';
import { listBlocksForSpace, getBlockById, updateBlockContent } from '../db/queries.js';

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
