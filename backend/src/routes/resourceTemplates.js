// Resource Template routes -- a deliberately separate mechanism from
// ordinary Templates (see the "--- Resource Templates ---" section in
// db/queries.js). CreateResource.jsx reads these to look up a matching
// type before falling back to its own generic three facets.

import { Router } from 'express';
import {
  listResourceTemplates,
  getResourceTemplateById,
  getResourceTemplateByType,
  createResourceTemplate,
  updateResourceTemplate,
  deleteResourceTemplate,
} from '../db/queries.js';

export const resourceTemplatesRouter = Router();

resourceTemplatesRouter.get('/resource-templates', (req, res) => {
  if (req.query.type) {
    const template = getResourceTemplateByType(req.query.type);
    return res.json(template || null);
  }
  res.json(listResourceTemplates());
});

resourceTemplatesRouter.post('/resource-templates', (req, res) => {
  const { type, label, facets } = req.body;
  if (!type || !type.trim() || !label || !label.trim()) {
    return res.status(400).json({ error: 'type and label are required' });
  }
  res.status(201).json(
    createResourceTemplate({ type: type.trim().toLowerCase(), label: label.trim(), facets: facets || [] })
  );
});

resourceTemplatesRouter.get('/resource-templates/:id', (req, res) => {
  const template = getResourceTemplateById(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Resource Template not found' });
  }
  res.json(template);
});

resourceTemplatesRouter.patch('/resource-templates/:id', (req, res) => {
  const existing = getResourceTemplateById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Resource Template not found' });
  }
  const { type, label, facets } = req.body;
  if (!type || !type.trim() || !label || !label.trim()) {
    return res.status(400).json({ error: 'type and label are required' });
  }
  res.json(
    updateResourceTemplate(req.params.id, { type: type.trim().toLowerCase(), label: label.trim(), facets: facets || [] })
  );
});

resourceTemplatesRouter.delete('/resource-templates/:id', (req, res) => {
  deleteResourceTemplate(req.params.id);
  res.status(204).end();
});
