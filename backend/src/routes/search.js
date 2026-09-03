// Search route: one query across Space titles/goals and everything
// written inside an entry. See db/queries/search.js.

import { Router } from 'express';
import { searchEverything } from '../db/queries.js';

export const searchRouter = Router();

searchRouter.get('/search', (req, res) => {
  res.json(searchEverything(req.query.q || ''));
});
