// Project routes: a real, named goal/project inside one Space that a
// Milestone or Session belongs to (see the "--- Projects ---" section
// in db/queries.js). Space-scoped routes (list/create) live under
// /spaces/:spaceId, same convention as blocks and Workspaces; a
// Project's own id then addresses it directly for its dedicated page
// (get/rename/delete).

import { Router } from 'express';
import {
  listProjectsForSpace,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectReport,
} from '../db/queries.js';
import { renderReportText } from '../reportFormat.js';

export const projectsRouter = Router();

projectsRouter.get('/spaces/:spaceId/projects', (req, res) => {
  res.json(listProjectsForSpace(req.params.spaceId));
});

projectsRouter.post('/spaces/:spaceId/projects', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.status(201).json(createProject({ spaceId: req.params.spaceId, name: name.trim() }));
});

projectsRouter.get('/projects/:id', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

projectsRouter.patch('/projects/:id', (req, res) => {
  const existing = getProjectById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.json(updateProject(req.params.id, { name: name.trim() }));
});

// A structured + prose snapshot of this Project's current state --
// see getProjectReport in queries.js.
projectsRouter.get('/projects/:id/report', (req, res) => {
  const report = getProjectReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({ report, narrative: renderReportText(report) });
});

projectsRouter.delete('/projects/:id', (req, res) => {
  const existing = getProjectById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }
  deleteProject(req.params.id);
  res.status(204).end();
});
