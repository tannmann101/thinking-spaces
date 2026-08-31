// Insights: one endpoint bundling every cross-Space facet InsightsPage.jsx
// shows, same "combined payload" pattern /activity already uses for the
// Log page. Doesn't belong under /spaces/:id or /dashboard since it reads
// across every Space at once, for its own dedicated page rather than a
// Dashboard digest.

import { Router } from 'express';
import {
  getWorkMixInsights,
  getThemeInsights,
  getActivityTrendInsights,
  getProvenanceInsights,
  getTimeInsights,
} from '../db/queries.js';

export const insightsRouter = Router();

insightsRouter.get('/insights', (req, res) => {
  res.json({
    workMix: getWorkMixInsights(),
    themes: getThemeInsights(),
    activity: getActivityTrendInsights(),
    provenance: getProvenanceInsights(),
    time: getTimeInsights(),
  });
});
