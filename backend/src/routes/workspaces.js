// Workspace routes: a deliberately assembled, named environment inside
// one Space (see the "--- Workspaces ---" section in db/queries.js).
// Space-scoped routes (list/create) live under /spaces/:spaceId, same
// convention as blocks; a Workspace's own id then addresses it directly
// for its dedicated page (get/rename/delete).

import { Router } from 'express';
import {
  listWorkspacesForSpace,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceReport,
  listAllWorkspaces,
} from '../db/queries.js';
import { renderReportText } from '../reportFormat.js';

export const workspacesRouter = Router();

// Every Workspace across every Space -- backs the top-level Workspaces
// page's directory. Declared before /workspaces/:id below so the literal
// path isn't captured as an id.
workspacesRouter.get('/workspaces', (req, res) => {
  res.json(listAllWorkspaces());
});

workspacesRouter.get('/spaces/:spaceId/workspaces', (req, res) => {
  res.json(listWorkspacesForSpace(req.params.spaceId));
});

workspacesRouter.post('/spaces/:spaceId/workspaces', (req, res) => {
  const { name, kind, starterBlocks } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (starterBlocks !== undefined && !Array.isArray(starterBlocks)) {
    return res.status(400).json({ error: 'starterBlocks must be an array' });
  }
  res.status(201).json(
    createWorkspace({
      spaceId: req.params.spaceId,
      name: name.trim(),
      kind: kind || null,
      starterBlocks: starterBlocks || [],
    })
  );
});

workspacesRouter.get('/workspaces/:id', (req, res) => {
  const workspace = getWorkspaceById(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  res.json(workspace);
});

workspacesRouter.patch('/workspaces/:id', (req, res) => {
  const existing = getWorkspaceById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.json(updateWorkspace(req.params.id, { name: name.trim() }));
});

// A structured + prose snapshot of this Workspace's current state --
// see getWorkspaceReport in queries.js.
workspacesRouter.get('/workspaces/:id/report', (req, res) => {
  const report = getWorkspaceReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  res.json({ report, narrative: renderReportText(report) });
});

workspacesRouter.delete('/workspaces/:id', (req, res) => {
  const existing = getWorkspaceById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  deleteWorkspace(req.params.id);
  res.status(204).end();
});
