// Trivial health-check endpoint. Its only purpose right now is proving
// the frontend and backend can actually talk to each other, and that the
// database file opens without error.

import { Router } from 'express';
import { db } from '../db/index.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM spaces').get();
  res.json({
    status: 'ok',
    message: 'Backend is up and the database is reachable.',
    spaceCount: count,
    time: new Date().toISOString(),
  });
});
