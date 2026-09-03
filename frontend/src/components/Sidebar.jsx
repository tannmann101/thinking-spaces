import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSpace, getNotificationCount } from '../api.js';
import Legend from './Legend.jsx';

// The one persistent piece of chrome shared by every page in the app --
// originally a horizontal top bar (see the git history for TopNav.jsx),
// rebuilt as a fixed left sidebar so the app reads as a real desktop
// app (a Slack/Notion/Obsidian-style persistent rail) rather than a
// centered mobile-width column with empty margins on a wide screen.
// `current` names which nav entry is "here" (one of the keys in LINKS
// below, or 'dashboard'/null on the Dashboard itself) so that entry
// gets a visual "you are here" marker -- the direct fix for "can I
// tell what page I'm on," on top of each page's own <h1>. The wordmark
// itself is a real link back to the Dashboard, which is what lets
// every page drop its own separate "back to Dashboard" text link
// without losing that path: one obvious way home, not two competing
// ones.
const LINKS = [
  { key: 'insights', to: '/insights', label: 'Insights' },
  { key: 'tools', to: '/tools', label: 'Tools' },
  { key: 'workspaces', to: '/workspaces', label: 'Workspaces' },
  { key: 'templates', to: '/templates', label: 'Manage Templates' },
  { key: 'graph', to: '/graph', label: 'View the Map' },
  { key: 'log', to: '/log', label: 'Log' },
];

function Sidebar({ current }) {
  const navigate = useNavigate();
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Fetched on every page, since the sidebar renders everywhere -- a
  // deliberately narrow, already-actionable count (overdue List
  // reviewBy items, overdue Spaces, overdue Milestones), not a raw
  // activity count. See getNeedsAttentionCount in
  // backend/src/db/queries/dashboard.js for what it excludes and why.
  useEffect(() => {
    // Promise.resolve(...) guards against a test file's own automocked
    // api.js, where an unconfigured getNotificationCount() returns
    // undefined rather than a real Promise -- every other page test in
    // the app renders Sidebar without necessarily caring about this
    // specific call, so this has to degrade to "0 notifications"
    // instead of throwing.
    Promise.resolve(getNotificationCount())
      .then((result) => setNeedsAttentionCount(result?.count ?? 0))
      .catch(() => {});
  }, []);

  // Quick capture: the fast path the app didn't have -- getting a
  // thought in previously always meant the full Creation Mode flow
  // (name it, pick a cluster, tags, ...). This is deliberately just a
  // title -- the same "Start Blank" a Space already supports, minus
  // every step between typing a name and landing on the page to
  // actually think in.
  async function submitCapture(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      const space = await createSpace({ title });
      setDraft('');
      setCapturing(false);
      navigate(`/spaces/${space.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="sidebar">
      <Link to="/" className="wordmark">
        Thinking Spaces<span className="dot">.</span>
      </Link>

      {capturing ? (
        <form className="quick-capture-form" onSubmit={submitCapture}>
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder="Quick capture: what's on your mind?"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => !draft.trim() && setCapturing(false)}
            onKeyDown={(event) => event.key === 'Escape' && setCapturing(false)}
          />
          <button type="submit" className="btn-ghost-small" disabled={!draft.trim() || submitting}>
            Create
          </button>
        </form>
      ) : (
        <button type="button" className="quick-capture-toggle" onClick={() => setCapturing(true)}>
          + Quick Capture
        </button>
      )}

      <nav className="nav-links">
        {LINKS.map((link) => (
          <Link key={link.key} to={link.to} className={current === link.key ? 'nav-link-current' : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>

      {needsAttentionCount > 0 && (
        <Link to="/" className="needs-attention-badge" title={`${needsAttentionCount} item(s) need attention`}>
          {needsAttentionCount === 1 ? '1 item needs attention' : `${needsAttentionCount} items need attention`}
        </Link>
      )}

      <button type="button" className="legend-trigger" onClick={() => setShowLegend(true)}>
        ? How to read this app
      </button>
      {showLegend && <Legend onClose={() => setShowLegend(false)} />}
    </aside>
  );
}

export default Sidebar;
