import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSpace, getNotificationCount } from '../api.js';

// The one persistent piece of chrome shared by every page in the app --
// pulled out of what used to be Dashboard.jsx's own local header so
// every other page (Tools, Log, Insights, The Map, Templates, a Space,
// a Workspace, every Creation flow) gets the same top bar instead of
// each being an island only reachable via a single "back to Dashboard"
// link. `current` names which nav entry is "here" (one of the keys in
// LINKS below, or 'dashboard'/null on the Dashboard itself) so that
// entry gets a visual "you are here" marker -- the direct fix for "can
// I tell what page I'm on," on top of each page's own <h1>. The
// wordmark itself is now a real link back to the Dashboard (it was
// already styled like one -- see .wordmark's `text-decoration: none` in
// index.css -- just never wrapped in a Link), which is what lets every
// page drop its own separate "back to Dashboard" text link without
// losing that path: one obvious way home, not two competing ones.
const LINKS = [
  { key: 'insights', to: '/insights', label: 'Insights' },
  { key: 'tools', to: '/tools', label: 'Tools' },
  { key: 'templates', to: '/templates', label: 'Manage Templates' },
  { key: 'graph', to: '/graph', label: 'View the Map' },
  { key: 'log', to: '/log', label: 'Log' },
];

function TopNav({ current }) {
  const navigate = useNavigate();
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetched on every page, since TopNav renders everywhere -- a
  // deliberately narrow, already-actionable count (overdue List
  // reviewBy items, overdue Spaces, overdue Milestones), not a raw
  // activity count. See getNeedsAttentionCount in
  // backend/src/db/queries/dashboard.js for what it excludes and why.
  useEffect(() => {
    // Promise.resolve(...) guards against a test file's own automocked
    // api.js, where an unconfigured getNotificationCount() returns
    // undefined rather than a real Promise -- every other page test in
    // the app renders TopNav without necessarily caring about this
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
    <header className="topbar">
      <Link to="/" className="wordmark">
        Thinking Spaces<span className="dot">.</span>
      </Link>
      <div className="topbar-right">
        <nav className="nav-links">
          {LINKS.map((link) => (
            <Link key={link.key} to={link.to} className={current === link.key ? 'nav-link-current' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        {needsAttentionCount > 0 && (
          <Link to="/" className="needs-attention-badge" title={`${needsAttentionCount} item(s) need attention`}>
            {needsAttentionCount}
          </Link>
        )}
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
      </div>
    </header>
  );
}

export default TopNav;
