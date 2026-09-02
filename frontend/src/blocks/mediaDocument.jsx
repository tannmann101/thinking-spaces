// Shared inline preview for a Media block's 'document' mediaType --
// used by both the ordinary MediaBlock feed row and MediaWorkshop, so
// the two can't drift on which file types get an inline preview versus
// a plain download link. Same reasoning textLinks.jsx/listItems.js were
// pulled out for (see CLAUDE.md's Tools vocabulary entry): one shared
// implementation instead of two copies that could disagree later.
//
// Store & view only (see CLAUDE.md's content-ingestion entry): PDF and
// image files get an inline preview, Markdown/.txt are fetched and shown
// as plain text, and every other file type (Office docs) is download-only
// -- no text extraction or search indexing of file contents.

import { useEffect, useState } from 'react';

const TEXT_LIKE_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

function DocumentPreview({ url, fileName, fileType, classPrefix = 'media-document' }) {
  const [textContent, setTextContent] = useState(null);
  const [textError, setTextError] = useState(null);
  const isTextLike = TEXT_LIKE_TYPES.has(fileType);
  const isPdf = fileType === 'application/pdf';

  useEffect(() => {
    // Synchronizing with a real external system (fetching the uploaded
    // file's own bytes over the network) -- the oxlint set-state-in-effect
    // warning this triggers is the same accepted, intentional case
    // SpacePage.jsx's own deep-link scroll effect documents, not
    // derivable state that belongs in render.
    if (!isTextLike || !url) return undefined;
    let cancelled = false;
    setTextContent(null);
    setTextError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch((err) => {
        if (!cancelled) setTextError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [url, isTextLike]);

  if (!url) {
    return <div className="media-placeholder">No file uploaded yet</div>;
  }

  return (
    <div className={classPrefix}>
      {isPdf && <iframe src={url} title={fileName || 'Document'} className={`${classPrefix}-pdf-frame`} />}
      {isTextLike &&
        (textError ? (
          <div className="media-placeholder">Could not load this file's text ({textError}).</div>
        ) : (
          <pre className={`${classPrefix}-text`}>{textContent === null ? 'Loading…' : textContent}</pre>
        ))}
      {!isPdf && !isTextLike && (
        <div className="media-placeholder">{fileName || 'Document'} — no inline preview for this file type</div>
      )}
      <a href={url} download={fileName || true} className={`${classPrefix}-download`}>
        ⬇ Download {fileName || 'file'}
      </a>
    </div>
  );
}

export default DocumentPreview;
