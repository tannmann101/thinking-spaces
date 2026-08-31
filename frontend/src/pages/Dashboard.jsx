import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getSpaces,
  getSpacesByTag,
  getOverdueReviews,
  getRecentTrail,
  getResurfaceSuggestion,
  deleteSpace,
} from '../api.js';
import SpaceGlyph, { SPACE_STATUSES } from '../glyph/SpaceGlyph.jsx';

function formatDate(isoLikeString) {
  // SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z"),
  // which Date() won't parse correctly unless we normalize it first.
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

// Every digest below renders as a native <details>, not a plain
// <section> -- with up to five of these able to stack above the Space
// list, collapsing the ones you don't need right now is what keeps
// that stack from just being "more scrolling before the actual list."
// Native and boring on purpose: no state to manage, no persistence
// needed, the browser already does this correctly.
function OverdueReviews({ items }) {
  if (items.length === 0) return null;
  return (
    <details className="digest" open>
      <summary>Overdue for review</summary>
      <ul>
        {items.map(({ spaceId, spaceTitle, item }) => (
          <li key={item.id}>
            <Link to={`/spaces/${spaceId}`}>{spaceTitle}</Link>: {item.text} (was due {item.reviewBy})
          </li>
        ))}
      </ul>
    </details>
  );
}

function RecentTrailDigest({ entries }) {
  if (entries.length === 0) return null;
  return (
    <details className="digest" open>
      <summary>This week, across your Spaces</summary>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={`/spaces/${entry.space_id}`}>{entry.spaceTitle}</Link>: {entry.summary}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ResurfaceSuggestion({ space }) {
  if (!space) return null;
  return (
    <details className="digest" open>
      <summary>Maybe revisit...</summary>
      <p>
        <Link to={`/spaces/${space.id}`}>{space.title}</Link> ({space.status}, last touched{' '}
        {formatDate(space.updated_at)})
      </p>
    </details>
  );
}

// "A Resource is just a Space tagged accordingly" (CLAUDE.md) -- this
// reads the same tags-on-a-Space query any other category could use,
// filtered to the one tag "resource" happens to use.
function ResourcesDigest({ spaces }) {
  if (spaces.length === 0) return null;
  return (
    <details className="digest" open>
      <summary>Resources</summary>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`}>{space.title}</Link>
            {/* A promoted Synthesis carries the "resource" tag too, so
                it shows up here alongside ordinary external Resources
                -- this distinguishes the two at a glance rather than
                letting a produced piece read as something sourced. */}
            {space.origin === 'internal' && (
              <span className="origin-badge-small" title="Produced by the app itself, promoted from a Synthesis">
                Internal
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Same pattern as ResourcesDigest above, filtered to the "synthesis"
// tag instead -- a Synthesis is just a Space tagged accordingly, same
// as a Resource is.
function SynthesesDigest({ spaces }) {
  if (spaces.length === 0) return null;
  return (
    <details className="digest" open>
      <summary>Syntheses</summary>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`}>{space.title}</Link>
            {space.tags.includes('resource') && (
              <span className="origin-badge-small" title="Promoted to Resource status">
                ↑ Resource
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Dashboard() {
  const [spaces, setSpaces] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [recentTrail, setRecentTrail] = useState([]);
  const [resurface, setResurface] = useState(null);
  const [resources, setResources] = useState([]);
  const [syntheses, setSyntheses] = useState([]);
  const [error, setError] = useState(null);
  // Search/status are view-only, not persisted -- narrowing which
  // Spaces show up in the list below, same "zoom in without hiding
  // anything permanently" principle the Category filter strip already
  // established on the Space page.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  function refetchSpaces() {
    getSpaces().then(setSpaces).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetchSpaces();
    getOverdueReviews().then(setOverdue).catch(() => {});
    getRecentTrail().then(setRecentTrail).catch(() => {});
    getResurfaceSuggestion().then(setResurface).catch(() => {});
    getSpacesByTag('resource').then(setResources).catch(() => {});
    getSpacesByTag('synthesis').then(setSyntheses).catch(() => {});
  }, []);

  // Same heavier, type-the-name confirmation as the Delete control on
  // the Space page itself -- this is the one place a Space can vanish
  // for good, so it should never be a single misclick away.
  async function handleDeleteSpace(space) {
    const typed = window.prompt(
      `Delete "${space.title}" and everything in it? This cannot be undone.\n\nType the Space's name to confirm:`
    );
    if (typed !== space.title) return;
    await deleteSpace(space.id);
    refetchSpaces();
  }

  return (
    <main>
      <header className="topbar">
        <span className="wordmark">
          Thinking Spaces<span className="dot">.</span>
        </span>
        <nav className="nav-links">
          <Link to="/tools">Tools</Link>
          <Link to="/templates">Manage Templates</Link>
          <Link to="/graph">View the Map</Link>
          <Link to="/log">Log</Link>
        </nav>
      </header>

      <p className="dashboard-create-row">
        <Link to="/spaces/new" className="new-space-btn">
          + New Space
        </Link>
        <Link to="/resources/new" className="new-space-btn new-resource-btn">
          + New Resource
        </Link>
        <Link to="/synthesis/new" className="new-space-btn new-resource-btn">
          + New Synthesis
        </Link>
      </p>

      <OverdueReviews items={overdue} />
      <RecentTrailDigest entries={recentTrail} />
      <ResurfaceSuggestion space={resurface} />
      <ResourcesDigest spaces={resources} />
      <SynthesesDigest spaces={syntheses} />

      {error && <p>Could not load spaces: {error}</p>}

      {!error && spaces === null && <p>Loading spaces...</p>}

      {spaces && spaces.length === 0 && (
        <p>No spaces yet. Create your first one to get started.</p>
      )}

      {spaces && spaces.length > 0 && (() => {
        const visibleSpaces = spaces.filter((space) => {
          const matchesSearch = space.title.toLowerCase().includes(search.trim().toLowerCase());
          const matchesStatus = !statusFilter || space.status === statusFilter;
          return matchesSearch && matchesStatus;
        });
        return (
          <>
            <p className="space-search-row">
              <input
                type="text"
                value={search}
                placeholder="Search Spaces by title..."
                className="space-search-input"
                onChange={(event) => setSearch(event.target.value)}
              />
              <span
                className={`category-filter-tab${statusFilter === null ? ' category-filter-tab-active' : ''}`}
                onClick={() => setStatusFilter(null)}
              >
                All
              </span>
              {SPACE_STATUSES.map((status) => (
                <span
                  key={status}
                  className={`category-filter-tab${statusFilter === status ? ' category-filter-tab-active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                >
                  {status}
                </span>
              ))}
            </p>
            {visibleSpaces.length === 0 && <p>No Spaces match &ldquo;{search}&rdquo;.</p>}
            {visibleSpaces.length > 0 && (
              <ul className="space-list">
                {visibleSpaces.map((space) => (
                  <li key={space.id} className="space-card">
                    <SpaceGlyph space={space} size={30} />
                    <div className="space-main">
                      <div className="space-title">
                        <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                        {space.isTestSpace && (
                          <span className="test-flag" title="Scratch area, not real content">
                            TEST SPACE
                          </span>
                        )}
                      </div>
                      <div className="space-meta">
                        <span className="status-pill" data-status={space.status}>
                          {space.status}
                        </span>
                        <span className="sep">·</span>
                        <span>updated {formatDate(space.updated_at)}</span>
                        {space.tags.length > 0 && (
                          <>
                            <span className="sep">·</span>
                            {space.tags.map((tag) => (
                              <span key={tag} className="tag-chip">
                                {tag}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                    {!space.isTestSpace && (
                      <button
                        type="button"
                        className="btn-ghost-small"
                        onClick={() => handleDeleteSpace(space)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
    </main>
  );
}

export default Dashboard;
