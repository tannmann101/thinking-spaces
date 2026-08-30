// Route handlers stay thin: parse the request, call a query function,
// send the result. No SQL lives here -- see db/queries.js.

import { Router } from 'express';
import { listSpaces, getSpaceById, createSpace } from '../db/queries.js';

export const spacesRouter = Router();

spacesRouter.get('/spaces', (req, res) => {
  res.json(listSpaces());
});

spacesRouter.post('/spaces', (req, res) => {
  const { title, templateId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const space = createSpace({ title: title.trim(), templateId: templateId || null });
  res.status(201).json(space);
});

spacesRouter.get('/spaces/:id', (req, res) => {
  const space = getSpaceById(req.params.id);
  if (!space) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json(space);
});
