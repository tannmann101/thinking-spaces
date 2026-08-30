// Entry point: wires up the Express app and starts listening.

import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { spacesRouter } from './routes/spaces.js';
import { templatesRouter } from './routes/templates.js';
import { ensureTestSpaceExists } from './db/queries.js';

ensureTestSpaceExists();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', spacesRouter);
app.use('/api', templatesRouter);

app.listen(PORT, () => {
  console.log(`Thinking Spaces backend listening on http://localhost:${PORT}`);
});
