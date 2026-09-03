// The Resources and Syntheses index pages. Each is listSpacesByTag plus
// the one extra thing that makes the page worth having -- see
// listResourcesIndex / listSynthesesIndex in db/queries/spaces.js.

import { Router } from 'express';
import { listResourcesIndex, listSynthesesIndex } from '../db/queries.js';

export const collectionsRouter = Router();

collectionsRouter.get('/resources', (req, res) => {
  res.json(listResourcesIndex());
});

collectionsRouter.get('/syntheses', (req, res) => {
  res.json(listSynthesesIndex());
});
