// "Work" routes: cross-Space browsing of Assessment/Question blocks
// (and any future kind added to WORK_TYPES), purely so Synthesis's
// picker can offer candidates from every Space, not just the current
// one -- same reasoning tags are queried by membership rather than
// per-Space. Nothing here is scoped to one Space, which is why this
// isn't just another route on spaces.js/blocks.js.

import { Router } from 'express';
import { listWorkItems } from '../db/queries.js';

export const workRouter = Router();

workRouter.get('/work-items', (req, res) => {
  res.json(listWorkItems());
});
