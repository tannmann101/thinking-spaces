import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpaces, getOverdueReviews, getRecentTrail, getResurfaceSuggestion } from '../api.js';
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

function Dashboard() {
  const [spaces, setSpaces] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [recentTrail, setRecentTrail] = useState([]);
  const [resurface, setResurface] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpaces().then(setSpaces).catch((err) => setError(err.message));
    getOverdueReviews().then(setOverdue).catch(() => {});
    getRecentTrail().then(setRecentTrail).catch(() => {});
    getResurfaceSuggestion().then(setResurface).catch(() => {});
  }, []);

  return (
    <main>
      <header className="topbar">
        <span className="wordmark">
          Thinking Spaces<span className="dot">.</span>
        </span>
        <nav className="nav-links">
          <Link to="/templates">Manage Templates</Link>
          <Link to="/graph">View the Map</Link>
        </nav>
      </header>

      <p>
        <Link to="/spaces/new" className="new-space-btn">
          + New Space
        </Link>
      </p>

      <OverdueReviews items={overdue} />
      <RecentTrailDigest entries={recentTrail} />
      <ResurfaceSuggestion space={resurface} />

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
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default Dashboard;
