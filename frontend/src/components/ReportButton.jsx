// One shared "Report" action for every level that can produce one -- a
// Space, a Workspace, a single Tool/Work item. The point of a report
// (per CLAUDE.md) is to hand a snapshot of that page's current state to
// an external Claude conversation for closer attention than an in-app
// view gives, so getting the text onto the clipboard easily matters
// more than how it looks here -- a prose view by default, a raw-data
// toggle for the structured form underneath it, and a Copy button.
//
// Fetches lazily, only once the panel is actually opened (same
// on-demand pattern Trail's own Rewind comparison already uses via
// getCurrentSkeleton) -- most Reports are never opened, so there's no
// reason to generate one for every block on every page load.

import { useState } from 'react';

function ReportButton({ fetchReport, label = 'Report' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchReport());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    const text = showRaw ? JSON.stringify(data.report, null, 2) : data.narrative;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="report-button-wrap">
      <button type="button" className="btn-ghost-small" onClick={toggle}>
        {open ? `Close ${label}` : label}
      </button>
      {open && (
        <div className="report-panel">
          {loading && <p>Generating report...</p>}
          {error && <p>Could not generate report: {error}</p>}
          {data && (
            <>
              <p className="report-panel-controls">
                <button type="button" className="btn-ghost-small" onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? 'View as text' : 'View raw data'}
                </button>
                <button type="button" className="btn-ghost-small" onClick={copy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </p>
              <pre className="report-panel-text">
                {showRaw ? JSON.stringify(data.report, null, 2) : data.narrative}
              </pre>
            </>
          )}
        </div>
      )}
    </span>
  );
}

export default ReportButton;
