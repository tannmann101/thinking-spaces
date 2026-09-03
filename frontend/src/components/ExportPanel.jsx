// The "get everything out of here" panel, reached from the Sidebar so
// it's available on every page. Same overlay pattern as Legend.jsx.
//
// Two downloads from one export: the JSON is the real backup (complete,
// nothing dropped) and the Markdown is the readable archive for when
// this app isn't around. Both are rendered server-side from the same
// payload, so they can't describe different data -- see
// backend/src/db/queries/exportData.js.
//
// The download is done by fetching the route and handing the browser a
// blob rather than pointing a plain <a href> at it. Both would work, but
// fetching means a failure surfaces as a message in the panel instead of
// silently navigating away from the app.

import { useState } from 'react';

const FILES = [
  {
    key: 'json',
    path: '/api/export/json',
    label: 'Download JSON',
    extension: 'json',
    note: 'The real backup -- every Space, entry, Workspace, Project, Trail entry and Template, complete.',
  },
  {
    key: 'markdown',
    path: '/api/export/markdown',
    label: 'Download Markdown',
    extension: 'md',
    note: 'The readable archive -- one document, every Space in order, legible in any editor. Lossy by design; not something to restore from.',
  },
];

function ExportPanel({ onClose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function download(file) {
    setBusy(file.key);
    setError(null);
    try {
      const res = await fetch(file.path);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `thinking-spaces-${new Date().toISOString().slice(0, 10)}.${file.extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Freed on the next tick rather than immediately -- revoking it in
      // the same frame as the click can cancel the download in some
      // browsers before it has actually started.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="legend-overlay" role="dialog" aria-label="Export everything" onClick={onClose}>
      <div className="legend-panel" onClick={(event) => event.stopPropagation()}>
        <div className="legend-header">
          <h2>Export everything</h2>
          <button type="button" className="btn-ghost-small" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="legend-intro">
          Everything in this app, in one file. Worth keeping a copy somewhere else &mdash; this is the only
          safeguard against losing what you&rsquo;ve built here.
        </p>

        {error && <p className="empty-note">{error}</p>}

        <ul className="export-options">
          {FILES.map((file) => (
            <li key={file.key}>
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => download(file)}
              >
                {busy === file.key ? 'Preparing...' : file.label}
              </button>
              <p className="empty-note">{file.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ExportPanel;
