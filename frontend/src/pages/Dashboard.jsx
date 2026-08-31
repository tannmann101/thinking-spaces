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
import SpaceGlyph from '../glyph/SpaceGlyph.jsx';

function formatDate(isoLikeString) {
  // SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z"),
  // which Date() won't parse correctly unless we normalize it first.
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

function OverdueReviews({ items }) {
  if (items.length === 0) return null;
  return (
    <section className="digest">
      <h3>Overdue for review</h3>
      <ul>
        {items.map(({ spaceId, spaceTitle, item }) => (
          <li key={item.id}>
            <Link to={`/spaces/${spaceId}`}>{spaceTitle}</Link>: {item.text} (was due {item.reviewBy})
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentTrailDigest({ entries }) {
  if (entries.length === 0) return null;
  return (
    <section className="digest">
      <h3>This week, across your Spaces</h3>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={`/spaces/${entry.space_id}`}>{entry.spaceTitle}</Link>: {entry.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResurfaceSuggestion({ space }) {
  if (!space) return null;
  return (
    <section className="digest">
      <h3>Maybe revisit...</h3>
      <p>
        <Link to={`/spaces/${space.id}`}>{space.title}</Link> ({space.status}, last touched{' '}
        {formatDate(space.updated_at)})
      </p>
    </section>
  );
}

// "A Resource is just a Space tagged accordingly" (CLAUDE.md) -- this
// reads the same tags-on-a-Space query any other category could use,
// filtered to the one tag "resource" happens to use.
function ResourcesDigest({ spaces }) {
  if (spaces.length === 0) return null;
  return (
    <section className="digest">
      <h3>Resources</h3>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`}>{space.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dashboard() {
  const [spaces, setSpaces] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [recentTrail, setRecentTrail] = useState([]);
  const [resurface, setResurface] = useState(null);
  const [resources, setResources] = useState([]);
  const [error, setError] = useState(null);

  function refetchSpaces() {
    getSpaces().then(setSpaces).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetchSpaces();
    getOverdueReviews().then(setOverdue).catch(() => {});
    getRecentTrail().then(setRecentTrail).catch(() => {});
    getResurfaceSuggestion().then(setResurface).catch(() => {});
    getSpacesByTag('resource').then(setResources).catch(() => {});
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
      </p>

      <OverdueReviews items={overdue} />
      <RecentTrailDigest entries={recentTrail} />
      <ResurfaceSuggestion space={resurface} />
      <ResourcesDigest spaces={resources} />

      {error && <p>Could not load spaces: {error}</p>}

      {!error && spaces === null && <p>Loading spaces...</p>}

      {spaces && spaces.length === 0 && (
        <p>No spaces yet. Create your first one to get started.</p>
      )}

      {spaces && spaces.length > 0 && (
        <ul className="space-list">
          {spaces.map((space) => (
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
    </main>
  );
}

export default Dashboard;
