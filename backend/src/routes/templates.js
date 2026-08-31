import { Router } from 'express';
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../db/queries.js';

export const templatesRouter = Router();

// The Creation flow lists these to offer as a starting point.
templatesRouter.get('/templates', (req, res) => {
  res.json(listTemplates());
});

templatesRouter.post('/templates', (req, res) => {
  const { name, blockArrangement } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.status(201).json(createTemplate({ name: name.trim(), blockArrangement: blockArrangement || [] }));
});

templatesRouter.get('/templates/:id', (req, res) => {
  const template = getTemplateById(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

templatesRouter.patch('/templates/:id', (req, res) => {
  const existing = getTemplateById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const { name, blockArrangement } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  res.json(updateTemplate(req.params.id, { name: name.trim(), blockArrangement: blockArrangement || [] }));
});

templatesRouter.delete('/templates/:id', (req, res) => {
  deleteTemplate(req.params.id);
  res.status(204).end();
});
