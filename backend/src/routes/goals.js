// Goal routes: a pursuit several Spaces can be working toward at once.
// See the "--- Goals ---" section in db/queries/goals.js for why a Goal
// deliberately has no Milestones or Sessions of its own.

import { Router } from 'express';
import {
  listGoalsIndex,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
  updateSpaceGoals,
} from '../db/queries.js';

export const goalsRouter = Router();

goalsRouter.get('/goals', (req, res) => {
  res.json(listGoalsIndex());
});

goalsRouter.post('/goals', (req, res) => {
  const { name, note } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.status(201).json(createGoal({ name: name.trim(), note: note?.trim() || null }));
});

goalsRouter.get('/goals/:id', (req, res) => {
  const goal = getGoalById(req.params.id);
  if (!goal) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.json(goal);
});

goalsRouter.patch('/goals/:id', (req, res) => {
  const { name, note } = req.body;
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  const updated = updateGoal(req.params.id, {
    ...(name === undefined ? {} : { name: name.trim() }),
    ...(note === undefined ? {} : { note: note?.trim() || null }),
  });
  if (!updated) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.json(updated);
});

goalsRouter.delete('/goals/:id', (req, res) => {
  if (!deleteGoal(req.params.id)) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.status(204).end();
});

// Which Goals a Space is working toward. Edited independently of the
// Space's own content, the same way Categories and tags already are.
goalsRouter.put('/spaces/:spaceId/goals', (req, res) => {
  const { goalIds } = req.body;
  if (!Array.isArray(goalIds)) {
    return res.status(400).json({ error: 'goalIds must be an array' });
  }
  const updated = updateSpaceGoals(req.params.spaceId, goalIds);
  if (!updated) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json({ goalIds, changeSummary: `Now working toward ${goalIds.length} Goal(s)` });
});
