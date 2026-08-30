// Entry point: wires up the Express app and starts listening.
// No feature routes yet -- just the plumbing (CORS, JSON parsing, and
// the health-check route) needed to prove the frontend can reach us.

import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);

app.listen(PORT, () => {
  console.log(`Thinking Spaces backend listening on http://localhost:${PORT}`);
});
