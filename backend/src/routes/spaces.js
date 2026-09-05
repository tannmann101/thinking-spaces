// Route handlers stay thin: parse the request, call a query function,
// send the result. No SQL lives here -- see db/queries.js.

import { Router } from 'express';
import {
  listSpaces,
  listSpacesByTag,
  getSpaceById,
  updateSpace,
  deleteSpace,
  listBacklinksForSpace,
  listSpaceHistory,
  addManualTrailEntry,
  updateTrailEntry,
  createSpaceWithSetup,
  createRelationalSpace,
  getSpaceReport,
  getReviewDraft,
  createReview,
} from '../db/queries.js';
import { renderReportText } from '../reportFormat.js';

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
// any starting Workspaces to assemble those Tools into, and initial
// tags/goal/categories, all composed by createSpaceWithSetup. Every
// field but title is optional, so this is still just as capable of
// "start blank" as it always was. categories exists here for guided
// creation flows (Resource creation) that already know which facets a
// Space's content should be organized under before any block exists.
spacesRouter.post('/spaces', (req, res) => {
  const { title, templateId, extraBlocks, resourceSpaceIds, tags, categories, workspaces, goal, origin } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const space = createSpaceWithSetup({
    title: title.trim(),
    templateId: templateId || null,
    extraBlocks: extraBlocks || [],
    resourceSpaceIds: resourceSpaceIds || [],
    tags: tags || [],
    categories: categories || [],
    workspaces: workspaces || [],
    goal: goal || null,
    origin: origin || null,
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

// Title, status, tags, goal, and categories are all edited through
// this one route -- the same "ordinary edit, not a special mode"
// principle Pass 4 applied to blocks now applies to the Space's own
// properties too. Any subset of fields can be sent.
spacesRouter.patch('/spaces/:id', (req, res) => {
  const { title, status, tags, goal, categories, theme, dueDate } = req.body;
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'title cannot be empty' });
  }
  const updated = updateSpace(req.params.id, {
    title: title !== undefined ? title.trim() : undefined,
    status,
    tags,
    goal,
    categories,
    theme,
    dueDate,
  });
  if (!updated) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json(updated);
});

// The one thing that could be created but never removed. Deletes the
// Space's blocks and Trail entries along with it -- see deleteSpace in
// queries.js for why that's explicit rather than relying on the
// database to cascade it.
spacesRouter.delete('/spaces/:id', (req, res) => {
  const existing = getSpaceById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Space not found' });
  }
  try {
    deleteSpace(req.params.id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.status(204).end();
});

spacesRouter.get('/spaces/:id/backlinks', (req, res) => {
  res.json(listBacklinksForSpace(req.params.id));
});

// A structured + prose snapshot of this Space's current state -- see
// getSpaceReport in queries.js. Meant to be copied out of the app
// wholesale (the narrative especially), not just viewed in place.
spacesRouter.get('/spaces/:id/report', (req, res) => {
  const report = getSpaceReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json({ report, narrative: renderReportText(report) });
});

// A Review's draft is read-only -- what a Review would say if created
// right now, so it can be shown before it's committed to Trail
// permanently. Creating one writes exactly that same computed summary
// as a new 'review'-kind Trail entry -- see getReviewDraft/createReview
// in queries.js.
spacesRouter.get('/spaces/:id/reviews/draft', (req, res) => {
  const draft = getReviewDraft(req.params.id);
  if (!draft) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.json(draft);
});

spacesRouter.post('/spaces/:id/reviews', (req, res) => {
  const review = createReview(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Space not found' });
  }
  res.status(201).json(review);
});

// A Space's full history -- its Trail entries and the activity
// recorded against it, merged (see listSpaceHistory). Trail entries on
// their own left this almost always empty; the path keeps its name
// because Trail is still what the section is called.
spacesRouter.get('/spaces/:id/trail', (req, res) => {
  res.json(listSpaceHistory(req.params.id));
});

spacesRouter.post('/spaces/:id/trail', (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  res.status(201).json(addManualTrailEntry(req.params.id, note.trim()));
});

// Attaches a "why" to an auto entry after the fact, or edits a manual
// entry's own note -- the one thing Trail entries couldn't do before
// (write-once). See updateTrailEntry in queries.js for how a manual
// entry's summary stays in sync with an edited note.
spacesRouter.patch('/spaces/:id/trail/:entryId', (req, res) => {
  const { note } = req.body;
  if (typeof note !== 'string' || !note.trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  const updated = updateTrailEntry(req.params.entryId, note.trim());
  if (!updated) {
    return res.status(404).json({ error: 'Trail entry not found' });
  }
  res.json(updated);
});
