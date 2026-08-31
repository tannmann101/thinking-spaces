// Cross-Space aggregation endpoints -- these don't belong under
// /spaces/:id since they read across every Space, not one.

import { Router } from 'express';
import {
  listOverdueReviews,
  listRecentTrailEntries,
  suggestSpaceToResurface,
  getGraphData,
  listGlobalActivity,
  getActivityStats,
} from '../db/queries.js';

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

// The Graph view (Pass 5): every Reference block across every Space,
// as nodes and edges. Cross-Space like everything else in this file.
dashboardRouter.get('/graph', (req, res) => {
  res.json(getGraphData());
});

// The Log: every structural lifecycle event plus the Trail, merged
// into one global feed, with a first, simple set of trend stats.
dashboardRouter.get('/activity', (req, res) => {
  res.json({ entries: listGlobalActivity(), stats: getActivityStats() });
});
