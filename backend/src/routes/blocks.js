import { Router } from 'express';
import { listBlocksForSpace } from '../db/queries.js';

export const blocksRouter = Router();

blocksRouter.get('/spaces/:spaceId/blocks', (req, res) => {
  res.json(listBlocksForSpace(req.params.spaceId));
});
