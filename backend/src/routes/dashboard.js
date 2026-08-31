// Cross-Space aggregation endpoints -- these don't belong under
// /spaces/:id since they read across every Space, not one.

import { Router } from 'express';
import { listOverdueReviews, listRecentTrailEntries, suggestSpaceToResurface } from '../db/queries.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard/overdue-reviews', (req, res) => {
  res.json(listOverdueReviews());
});

dashboardRouter.get('/dashboard/recent-trail', (req, res) => {
  res.json(listRecentTrailEntries());
});

dashboardRouter.get('/dashboard/resurface', (req, res) => {
  res.json(suggestSpaceToResurface());
});
