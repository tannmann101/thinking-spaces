// Pass 5's "Map": every Reference block across every Space, drawn as
// nodes and edges by GraphView (registered in registry/views.js), plus
// the ability to select two or more Spaces and promote them into a new
// "Relational Space" -- an ordinary Space, tagged 'relational', pre-
// seeded with a Reference block to each selection and one blank Text
// block for your own writing about the connection. See
// createRelationalSpace in backend/src/db/queries.js: no new schema,
// just the same createSpace/addBlockToSpace every other Space uses.
// Deliberately doesn't call that blank Text block "for the synthesis"
// -- "Synthesis" is also a separate, formal top-level feature elsewhere
// in the app (CreateSynthesis.jsx), and the two shouldn't share wording.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGraph, createRelationalSpace } from '../api.js';
import { viewRegistry } from '../registry/views.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const GraphView = viewRegistry.graph.component;

function GraphPage() {
  usePageTitle('The Map');
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getGraph().then(setGraph).catch((err) => setError(err.message));
  }, []);

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!title.trim() || selected.size < 2) return;
    setCreating(true);
    try {
      const space = await createRelationalSpace({ title: title.trim(), spaceIds: [...selected] });
      navigate(`/spaces/${space.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar current="graph" />
      {/* app-content-wide: the one page that genuinely needs the full
          remaining width rather than the ordinary reading-width cap --
          see the comment on .app-content-wide in index.css. */}
      <main className="app-content app-content-wide">
      <h1>The Map</h1>

      {error && <p>Error: {error}</p>}
      {!graph && !error && <p>Loading...</p>}

      {graph && (
        <>
          <GraphView spaces={graph.spaces} workspaces={graph.workspaces} edges={graph.edges} />

          <h2>Combine Spaces into a Relational Space</h2>
          <p>Select two or more Spaces below, name the new Space, and it will start with a Reference to each one plus a blank space to write about the connection.</p>

          {graph.spaces.length === 0 && <p>No Spaces yet.</p>}
          <ul className="checkbox-list">
            {graph.spaces.map((space) => (
              <li key={space.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(space.id)}
                    onChange={() => toggle(space.id)}
                  />{' '}
                  {space.title}
                </label>
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreate}>
            <label>
              New Relational Space name:{' '}
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>{' '}
            <button type="submit" className="btn btn-primary" disabled={creating || selected.size < 2 || !title.trim()}>
              {creating ? 'Creating...' : `Create Relational Space (${selected.size} selected)`}
            </button>
            {selected.size === 1 && <p>Select at least one more Space.</p>}
          </form>
        </>
      )}
      </main>
    </div>
  );
}

export default GraphPage;
