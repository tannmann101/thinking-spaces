import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpaces } from '../api.js';
import SpaceGlyph from '../glyph/SpaceGlyph.jsx';

function formatDate(isoLikeString) {
  // SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z"),
  // which Date() won't parse correctly unless we normalize it first.
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

function Dashboard() {
  const [spaces, setSpaces] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpaces().then(setSpaces).catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>Thinking Spaces</h1>
      <p>
        <Link to="/spaces/new">+ New Space</Link>
      </p>

      {error && <p>Could not load spaces: {error}</p>}

      {!error && spaces === null && <p>Loading spaces...</p>}

      {spaces && spaces.length === 0 && (
        <p>No spaces yet. Create your first one to get started.</p>
      )}

      {spaces && spaces.length > 0 && (
        <ul>
          {spaces.map((space) => (
            <li key={space.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SpaceGlyph space={space} size={24} />
              <span>
                <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                {space.isTestSpace && (
                  <strong> [TEST SPACE — scratch area, not real content]</strong>
                )}
                {' — '}
                status: {space.status}
                {' — '}
                updated: {formatDate(space.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default Dashboard;
