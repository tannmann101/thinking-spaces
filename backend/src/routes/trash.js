// Trash routes: what a delete removed, and putting it back. See
// db/queries/trash.js.

import { Router } from 'express';
import { listTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from '../db/queries.js';

export const trashRouter = Router();

trashRouter.get('/trash', (req, res) => {
  res.json(listTrash());
});

trashRouter.post('/trash/:id/restore', (req, res) => {
  const restored = restoreFromTrash(req.params.id);
  if (!restored) {
    return res.status(404).json({ error: 'Nothing in the trash with that id' });
  }
  res.json({ ...restored, changeSummary: `Restored ${restored.kind} "${restored.label}"` });
});

// Permanent, unlike the delete that put it here.
trashRouter.delete('/trash/:id', (req, res) => {
  if (!purgeTrashEntry(req.params.id)) {
    return res.status(404).json({ error: 'Nothing in the trash with that id' });
  }
  res.status(204).end();
});

trashRouter.delete('/trash', (req, res) => {
  res.json({ purged: emptyTrash() });
});
