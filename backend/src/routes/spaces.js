// Route handlers stay thin: parse the request, call a query function,
// send the result. No SQL lives here -- see db/queries.js.

import { Router } from 'express';
import {
  listSpaces,
  listSpacesByTag,
  getSpaceById,
  updateSpace,
  listBacklinksForSpace,
  listTrailEntries,
  addManualTrailEntry,
  createSpaceWithSetup,
  createRelationalSpace,
} from '../db/queries.js';

export const spacesRouter = Router();

// ?tag=resource (or any tag) filters to Spaces carrying that tag --
// one endpoint, not a separate route per category, since a tag is just
// a tag whether it means "Resource" or something invented later.
spacesRouter.get('/spaces', (req, res) => {
  const { tag } = req.query;
  res.json(tag ? listSpacesByTag(tag) : listSpaces());
});

// Creation Mode: a Template (applied once, not a live link -- see
// applyTemplate in queries.js), any extra Tools chosen on top of it,
// any Resources pulled in (each becomes an ordinary Reference block),
// and initial tags/goal, all composed by createSpaceWithSetup. Every
// field but title is optional, so this is still just as capable of
// "start blank" as it always was.
spacesRouter.post('/spaces', (req, res) => {
  const { title, templateId, extraBlocks, resourceSpaceIds, tags, goal } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const space = createSpaceWithSetup({
    title: title.trim(),
    templateId: templateId || null,
    extraBlocks: extraBlocks || [],
    resourceSpaceIds: resourceSpaceIds || [],
    tags: tags || [],
    goal: goal || null,
  });
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

// Title, status, tags, and goal are all edited through this one route --
// the same "ordinary edit, not a special mode" principle Pass 4 applied
// to blocks now applies to the Space's own properties too. Any subset
// of fields can be sent.
spacesRouter.patch('/spaces/:id', (req, res) => {
  const { title, status, tags, goal } = req.body;
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'title cannot be empty' });
  }
  const updated = updateSpace(req.params.id, {
    title: title !== undefined ? title.trim() : undefined,
    status,
    tags,
    goal,
  });
  if (!updated) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json(updated);
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
