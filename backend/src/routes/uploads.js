// POST /uploads (multipart form upload) and GET /uploads/:filename (serving
// the stored file back out) -- the "file document" half of content
// ingestion, alongside link-preview.js's "paste a link" half. Store & view
// only, same as link preview: no text extraction, no search indexing.
//
// Files land on the local filesystem under backend/data/uploads/ (already
// covered by the repo's blanket backend/data/ gitignore -- see Hosting in
// CLAUDE.md). This is backend/-only for now: worker/'s Cloudflare-hosted
// version would need R2 (Cloudflare's object storage) to do the same job,
// which this session can't provision without the person's help, mirroring
// the earlier D1-API-token precedent -- not ported yet, see CLAUDE.md Open.

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Generated, not user-supplied: a filename is a random UUID plus whatever
// extension the original had, so nothing about the file a person picks
// (its name, path separators inside it) ever becomes part of a path this
// server writes to or reads from.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    // Markdown/.txt sometimes arrive with no recognizable mimetype at all
    // depending on the browser/OS -- fall back to checking the extension.
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.md', '.markdown', '.txt'].includes(ext)) return cb(null, true);
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
