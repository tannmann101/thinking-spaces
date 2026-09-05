// What counts as an acceptable upload, and what it gets stored as.
//
// Pure functions -- no filesystem, no R2, no Express, no Workers API --
// so the same file can be a verbatim copy in worker/src/uploadRules.js,
// exactly as linkPreview.js already is. That copying is deliberate: the
// two backends are parallel implementations (see CLAUDE.md's Hosting
// section), and a shared rule that silently differed between them would
// mean a file the local app accepts being rejected by the live site, or
// worse, the reverse.

// 25 MB. Comfortably under the Workers request-body limit, and far more
// than a PDF or a scan of something needs.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
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

// Markdown and .txt arrive with no reliable mimetype -- it varies by
// browser and OS, and is sometimes empty -- so the extension is a
// deliberate fallback for those two, and only those two.
const EXTENSION_FALLBACK = ['.md', '.markdown', '.txt'];

// The extension of a filename, lowercased, including the dot.
//
// Only the basename can carry one: a dot earlier in a path
// ("../../etc/passwd") is not an extension, and treating it as one would
// put slashes into a generated filename. Node's path.extname knows that,
// but this module stays dependency-free so it can be copied verbatim
// into the Worker, which has no node:path -- so it does the same job by
// hand. Capped in length, and finally checked against a strict shape:
// anything that isn't a plain dot-and-alphanumerics yields no extension
// at all, which is always a safe answer.
export function extensionOf(originalName = '') {
  const base = String(originalName).split(/[\\/]/).pop();
  const lastDot = base.lastIndexOf('.');
  // `<= 0` rather than `=== -1`: a leading dot is a hidden file, not an
  // extension ('.gitignore' has none).
  if (lastDot <= 0) return '';
  const ext = base.slice(lastDot).toLowerCase().slice(0, 10);
  return /^\.[a-z0-9]+$/.test(ext) ? ext : '';
}

export function isAllowedFile(mimeType, originalName) {
  if (ALLOWED_MIME_TYPES.has(mimeType)) return true;
  return EXTENSION_FALLBACK.includes(extensionOf(originalName));
}

// Generated, never user-supplied. Nothing about the file a person picks
// -- its name, or path separators inside it -- becomes part of the key
// this stores under, which is what makes traversal a non-question
// rather than something to defend against after the fact.
export function storedFilenameFor(originalName, uuid) {
  return `${uuid}${extensionOf(originalName)}`;
}

// A stored name is only ever one this module generated, so anything
// that doesn't look like one is rejected on the way back out rather
// than passed to storage. Belt and braces: on R2 a stray slash would
// just be a different key rather than an escape, but "only serve what
// we could have written" is the rule worth enforcing either way.
export function isValidStoredFilename(name = '') {
  return /^[0-9a-f-]{36}(\.[A-Za-z0-9]{1,9})?$/.test(name);
}
