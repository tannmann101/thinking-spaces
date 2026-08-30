import { Router } from 'express';
import { listTemplates } from '../db/queries.js';

export const templatesRouter = Router();

// Returns an empty array until Pass 3 actually builds Templates.
// The Creation flow uses this to know there's nothing to pick from yet.
templatesRouter.get('/templates', (req, res) => {
  res.json(listTemplates());
});
