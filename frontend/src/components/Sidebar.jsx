import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { captureThought, getNotificationCount } from '../api.js';
import Legend from './Legend.jsx';
import ExportPanel from './ExportPanel.jsx';

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
  { key: 'spaces', to: '/spaces', label: 'Spaces' },
  { key: 'resources', to: '/resources', label: 'Resources' },
  { key: 'syntheses', to: '/syntheses', label: 'Syntheses' },
  { key: 'insights', to: '/insights', label: 'Insights' },
  { key: 'tools', to: '/tools', label: 'Tools' },
  { key: 'workspaces', to: '/workspaces', label: 'Workspaces' },
  { key: 'projects', to: '/projects', label: 'Projects' },
  { key: 'goals', to: '/goals', label: 'Goals' },
  { key: 'templates', to: '/templates', label: 'Manage Templates' },
  { key: 'graph', to: '/graph', label: 'View the Map' },
  { key: 'log', to: '/log', label: 'Log' },
];

function Sidebar({ current }) {
  const navigate = useNavigate();
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  // Only meaningful on a narrow screen, where the sidebar becomes a
  // compact top bar and everything but the wordmark and quick capture
  // folds behind a toggle. Above 760px the toggle is display:none and
  // this is ignored -- the nav is always shown there.
  const [navOpen, setNavOpen] = useState(false);

  // Fetched on every page, since the sidebar renders everywhere -- a
  // deliberately narrow, already-actionable count (overdue List
  // reviewBy items, overdue Spaces, overdue Milestones), not a raw
  // activity count. See getNeedsAttentionCount in
  // worker/src/db/dashboard.js for what it excludes and why.
  useEffect(() => {
    // Promise.resolve(...) guards against a test file's own automocked
    // api.js, where an unconfigured getNotificationCount() returns
    // undefined rather than a real Promise -- every other page test in
    // the app renders Sidebar without necessarily caring about this
    // specific call, so this has to degrade to "0 notifications"
    // instead of throwing.
    Promise.resolve(getNotificationCount())
      .then((result) => {
        setNeedsAttentionCount(result?.count ?? 0);
        setInboxCount(result?.inbox ?? 0);
      })
      .catch(() => {});
  }, []);

  // Quick capture: the fast path the app didn't have -- getting a
  // thought in previously always meant the full Creation Mode flow
  // (name it, pick a cluster, tags, ...).
  //
  // It captures the *thought*, not a title, and appends it to the Inbox
  // rather than minting a Space. Two reasons: away from the desk the
  // thought is the content, and naming the container for it is exactly
  // the work you can't do at that moment; and a Space per stray thought
  // fills the index with one-line stubs. Deliberately starting a real
  // Space is what "+ New Space" is for.
  //
  // It also does not navigate. Capturing should leave you where you
  // were -- the toast confirms it landed, and the Inbox link below shows
  // how much is waiting.
  // Search lives in the Sidebar rather than on one page because the
  // original complaint was "hard to find things" -- a search you have to
  // navigate to first only half solves that. Submitting hands off to the
  // /search page, which owns the actual query and its results.
  function submitSearch(event) {
    event.preventDefault();
    const q = searchDraft.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  async function submitCapture(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await captureThought(text);
      setDraft('');
      setCapturing(false);
      setInboxCount((count) => count + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="sidebar" data-nav-open={navOpen ? 'true' : 'false'}>
      <Link to="/" className="wordmark">
        Thinking Spaces<span className="dot">.</span>
      </Link>

      {/* Narrow screens only (display:none above 760px). Capture stays
          in the bar itself, since getting a thought in is the one thing
          worth a single tap; everything else is a tap further away. */}
      <button
        type="button"
        className="sidebar-menu-toggle"
        aria-expanded={navOpen}
        aria-label={navOpen ? 'Hide menu' : 'Show menu'}
        onClick={() => setNavOpen((open) => !open)}
      >
        {navOpen ? '\u2715' : '\u2630'}
      </button>

      {capturing ? (
        <form className="quick-capture-form" onSubmit={submitCapture}>
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder="What's on your mind?"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => !draft.trim() && setCapturing(false)}
            onKeyDown={(event) => event.key === 'Escape' && setCapturing(false)}
          />
          <button type="submit" className="btn-ghost-small" disabled={!draft.trim() || submitting}>
            Capture
          </button>
        </form>
      ) : (
        <button type="button" className="quick-capture-toggle" onClick={() => setCapturing(true)}>
          + Quick Capture
        </button>
      )}

      <form className="sidebar-search" onSubmit={submitSearch} role="search">
        <input
          type="search"
          value={searchDraft}
          placeholder="Search everything"
          aria-label="Search everything"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      </form>

      <nav className="nav-links">
        {LINKS.map((link) => (
          <Link key={link.key} to={link.to} className={current === link.key ? 'nav-link-current' : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>

      {inboxCount > 0 && (
        <Link to={`/spaces/inbox`} className="inbox-link" title={`${inboxCount} unfiled in your Inbox`}>
          Inbox <span className="inbox-count">{inboxCount}</span>
        </Link>
      )}

      {needsAttentionCount > 0 && (
        <Link to="/" className="needs-attention-badge" title={`${needsAttentionCount} item(s) need attention`}>
          {needsAttentionCount === 1 ? '1 item needs attention' : `${needsAttentionCount} items need attention`}
        </Link>
      )}

      <button type="button" className="legend-trigger" onClick={() => setShowLegend(true)}>
        ? How to read this app
      </button>
      {showLegend && <Legend onClose={() => setShowLegend(false)} />}

      <Link to="/trash" className="legend-trigger">
        Recently deleted
      </Link>

      <button type="button" className="legend-trigger" onClick={() => setShowExport(true)}>
        Export everything
      </button>
      {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
    </aside>
  );
}

export default Sidebar;
