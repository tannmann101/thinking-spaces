import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSpace } from '../api.js';

// Placeholder for Pass 1: shows only title and status. Blocks, Views,
// and everything else land here in Pass 2 and beyond.
function SpacePage() {
  const { id } = useParams();
  const [space, setSpace] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpace(id).then(setSpace).catch((err) => setError(err.message));
  }, [id]);

  return (
    <main>
      <p>
        <Link to="/">&larr; Back to Dashboard</Link>
      </p>

      {error && <p>Could not load Space: {error}</p>}
      {!error && !space && <p>Loading...</p>}

      {space && (
        <>
          <h1>
            {space.title}
            {space.isTestSpace && ' [TEST SPACE]'}
          </h1>
          <p>Status: {space.status}</p>
        </>
      )}
    </main>
  );
}

export default SpacePage;
