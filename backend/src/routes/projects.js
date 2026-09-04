// Project routes. A Project is standalone -- created from the Projects
// page, not inside a Space -- so creation lives at /projects rather
// than under /spaces/:spaceId. The Space-scoped GET remains, but now
// answers "which Projects have work in this Space", derived from where
// its member entries live (see the "--- Projects ---" section in
// db/queries.js).

import { Router } from 'express';
import {
  listProjectsForSpace,
  listProjectsIndex,
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

// Every Project, with derived Spaces and progress. Declared before
// /projects/:id so the literal path isn't captured as an id.
projectsRouter.get('/projects', (req, res) => {
  res.json(listProjectsIndex());
});

projectsRouter.post('/projects', (req, res) => {
  const { name, goalId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.status(201).json(createProject({ name: name.trim(), goalId: goalId || null }));
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
  const { name, goalId } = req.body;
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  if (name === undefined && goalId === undefined) {
    return res.status(400).json({ error: 'name or goalId is required' });
  }
  res.json(
    updateProject(req.params.id, {
      ...(name === undefined ? {} : { name: name.trim() }),
      ...(goalId === undefined ? {} : { goalId: goalId || null }),
    })
  );
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
