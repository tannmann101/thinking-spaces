// Route handlers stay thin: parse the request, call a query function,
// send the result. No SQL lives here -- see db/queries.js.

import { Router } from 'express';
import {
  listSpaces,
  getSpaceById,
  createSpace,
  listBacklinksForSpace,
  listTrailEntries,
  addManualTrailEntry,
  applyTemplate,
  createRelationalSpace,
} from '../db/queries.js';

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
  // Applying a Template is a one-time copy of its blocks into the new
  // Space, not a live link -- see applyTemplate in queries.js.
  if (templateId) {
    applyTemplate(space.id, templateId);
  }
  res.status(201).json(space);
});

// A Relational Space is just an ordinary Space, pre-seeded with a
// Reference block per selected Space plus a blank Text block for the
// synthesis -- see createRelationalSpace in queries.js.
spacesRouter.post('/spaces/relational', (req, res) => {
  const { title, spaceIds } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Array.isArray(spaceIds) || spaceIds.length < 2) {
    return res.status(400).json({ error: 'select at least two Spaces' });
  }
  res.status(201).json(createRelationalSpace({ title: title.trim(), spaceIds }));
});

spacesRouter.get('/spaces/:id', (req, res) => {
  const space = getSpaceById(req.params.id);
  if (!space) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json(space);
});

spacesRouter.get('/spaces/:id/backlinks', (req, res) => {
  res.json(listBacklinksForSpace(req.params.id));
});

spacesRouter.get('/spaces/:id/trail', (req, res) => {
  res.json(listTrailEntries(req.params.id));
});

spacesRouter.post('/spaces/:id/trail', (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  res.status(201).json(addManualTrailEntry(req.params.id, note.trim()));
});
