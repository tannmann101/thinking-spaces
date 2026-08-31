import { Router } from 'express';
import { listTemplates } from '../db/queries.js';

export const templatesRouter = Router();

// The Creation flow lists these to offer as a starting point.
templatesRouter.get('/templates', (req, res) => {
  res.json(listTemplates());
});
