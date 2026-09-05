// POST /uploads (multipart form upload) and GET /uploads/:filename (serving
// the stored file back out) -- the "file document" half of content
// ingestion, alongside link-preview.js's "paste a link" half. Store & view
// only, same as link preview: no text extraction, no search indexing.
//
// Files land on the local filesystem under backend/data/uploads/ (already
// covered by the repo's blanket backend/data/ gitignore -- see Hosting in
// CLAUDE.md). worker/ does the same job against R2 instead, since a
// Worker has no filesystem; both sides share uploadRules.js (a verbatim
// copy on each, like linkPreview.js) so what counts as an acceptable
// file, and what it gets stored as, can't drift between them.

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_UPLOAD_BYTES, isAllowedFile, storedFilenameFor } from '../uploadRules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Generated, not user-supplied: a filename is a random UUID plus whatever
// extension the original had, so nothing about the file a person picks
// (its name, path separators inside it) ever becomes part of a path this
// server writes to or reads from.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, storedFilenameFor(file.originalname, randomUUID())),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (isAllowedFile(file.mimetype, file.originalname)) return cb(null, true);
    cb(new Error('Unsupported file type.'));
  },
});

export const uploadsRouter = express.Router();

uploadsRouter.post('/uploads', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/api/uploads/${req.file.filename}`,
    });
  });
});

uploadsRouter.get('/uploads/:filename', (req, res) => {
  // path.basename strips any directory components a crafted filename
  // param might carry, then the resolved path is re-checked against the
  // uploads dir itself as a second, defensive layer against traversal.
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});
