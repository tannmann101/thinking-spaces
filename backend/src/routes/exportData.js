// Export routes: a complete, downloadable copy of everything the app
// holds -- see db/queries/exportData.js for why this lives in the app
// rather than in a local CLI script.

import { Router } from 'express';
import { getFullExport } from '../db/queries.js';
import { renderExportMarkdown } from '../exportFormat.js';

export const exportRouter = Router();

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// The real backup: every table, complete. Sent as an attachment so the
// browser saves it rather than rendering a wall of JSON.
exportRouter.get('/export/json', (req, res) => {
  const data = getFullExport();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="thinking-spaces-${stamp()}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// The readable archive, rendered from the exact same payload so the two
// can never describe different data.
exportRouter.get('/export/markdown', (req, res) => {
  const data = getFullExport();
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="thinking-spaces-${stamp()}.md"`);
  res.send(renderExportMarkdown(data));
});
