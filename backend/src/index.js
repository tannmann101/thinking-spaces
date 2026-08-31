// Entry point: wires up the Express app and starts listening.

import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { spacesRouter } from './routes/spaces.js';
import { templatesRouter } from './routes/templates.js';
import { blocksRouter } from './routes/blocks.js';
import { workspacesRouter } from './routes/workspaces.js';
import { skeletonRouter } from './routes/skeleton.js';
import { workRouter } from './routes/work.js';
import { insightsRouter } from './routes/insights.js';
import { dashboardRouter } from './routes/dashboard.js';
import { ensureTestSpaceExists, migrateTextBlockLines, migrateWorkItemSupport } from './db/queries.js';
import { seedTestSpaceBlocks } from './db/seedTestSpace.js';
import { seedTemplates } from './db/seedTemplates.js';

ensureTestSpaceExists();
// One-time backfill for any Text block created before the per-line
// {lines} content shape existed -- new blocks self-normalize at
// creation (see createBlock in db/queries.js), so this only ever has
// pre-existing rows left to do, and is a no-op once they're all done.
migrateTextBlockLines();
migrateWorkItemSupport();
seedTemplates();
seedTestSpaceBlocks();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', spacesRouter);
app.use('/api', templatesRouter);
app.use('/api', blocksRouter);
app.use('/api', workspacesRouter);
app.use('/api', skeletonRouter);
app.use('/api', workRouter);
app.use('/api', insightsRouter);
app.use('/api', dashboardRouter);

app.listen(PORT, () => {
  console.log(`Thinking Spaces backend listening on http://localhost:${PORT}`);
});
