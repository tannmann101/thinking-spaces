// The top-level Workspaces page: what specialized environments exist,
// and where the ones you already have actually are.
//
// Two halves, deliberately. The catalog answers "what can I start" and
// reads straight from registry/workspaceKinds.js -- like the Tools
// catalog, nothing here is separate data that could drift from what the
// app actually offers. The directory answers "where was I working on
// that", which nothing in the app could answer before: a Workspace lives
// inside one Space, so finding one previously meant remembering which
// Space it was in and going there first.
//
// Starting a kind from here needs a Space to put it in, since a
// Workspace belongs to exactly one -- so the catalog asks which, rather
// than inventing a home for it.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAllWorkspaces, getSpaces, createWorkspace } from '../api.js';
import { workspaceKindRegistry, WORKSPACE_KIND_ORDER, getWorkspaceKind } from '../registry/workspaceKinds.js';
import { blockRegistry } from '../registry/blocks.js';
import { themeAttributes } from '../theme/itemTheme.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// "Writing, Formulation x3" rather than repeating a label once per block
// -- Worldview Assessment seeds three Formulations, one per axis, and
// listing the same word three times reads as a bug.
function summarizeStarters(starterBlocks) {
  const counts = new Map();
  starterBlocks.forEach((spec) => {
    const label = blockRegistry[spec.type]?.label || spec.type;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].map(([label, n]) => (n > 1 ? `${label} \u00d7${n}` : label)).join(', ');
}

function KindCard({ kind, spaces, onStart, starting }) {
  const [spaceId, setSpaceId] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="kind-card" {...themeAttributes(kind.theme)}>
      <h3 className="kind-card-title">
        <span className="kind-card-icon">{kind.icon}</span> {kind.label}
      </h3>
      <p className="kind-card-description">{kind.description}</p>

      <p className="kind-card-label">Sections</p>
      <ul className="kind-card-sections">
        {kind.sections.map((section) => (
          <li key={section.name}>
            <strong>{section.name}</strong> &mdash; {section.prompt}
          </li>
        ))}
      </ul>

      <p className="kind-card-label">Starts you with</p>
      <p className="kind-card-starters">
        {kind.starterBlocks.length === 0 ? 'An empty environment.' : summarizeStarters(kind.starterBlocks)}
      </p>

      {!open ? (
        <button type="button" className="btn-ghost-small" onClick={() => setOpen(true)}>
          Start a {kind.label} Workspace
        </button>
      ) : (
        <div className="kind-card-start">
          <label>
            In which Space?{' '}
            <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
              <option value="">Choose a Space...</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.title}
                </option>
              ))}
            </select>
          </label>{' '}
          <button
            type="button"
            className="btn"
            disabled={!spaceId || starting}
            onClick={() => onStart(kind, spaceId)}
          >
            Create
          </button>{' '}
          <button type="button" className="btn-ghost-small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function WorkspacesPage() {
  usePageTitle('Workspaces');
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    Promise.all([getAllWorkspaces(), getSpaces()])
      .then(([allWorkspaces, allSpaces]) => {
        setWorkspaces(allWorkspaces);
        setSpaces(allSpaces);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleStart(kind, spaceId) {
    setStarting(true);
    try {
      // The registry is read here, on the frontend, and passed to the
      // backend as plain block specs -- the backend never needs to know
      // what a kind contains, only which one this is.
      const workspace = await createWorkspace(spaceId, kind.label, kind.key, kind.starterBlocks);
      navigate(`/spaces/${spaceId}/workspaces/${workspace.id}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar current="workspaces" />
      <main className="app-content">
        <h1>Workspaces</h1>
        <p>
          A Workspace is a place to actually do the work, inside one Space &mdash; a set of Tools assembled
          around one kind of thinking, with its own page and its own shape. The Tools catalog shows the
          individual instruments; this shows the environments they get used in.
        </p>

        {error && <p>Could not load Workspaces: {error}</p>}

        <h2>Kinds</h2>
        <p>
          Each kind arranges its page differently and leads with its own Tools. You can add anything to any
          Workspace &mdash; a kind shapes it, it never restricts it.
        </p>
        <div className="kind-grid">
          {WORKSPACE_KIND_ORDER.map((key) => (
            <KindCard
              key={key}
              kind={workspaceKindRegistry[key]}
              spaces={spaces}
              starting={starting}
              onStart={handleStart}
            />
          ))}
        </div>

        <h2>Your Workspaces</h2>
        {workspaces.length === 0 ? (
          <p className="empty-note">
            None yet. Start one from a kind above, or create a plain one from any Space&rsquo;s own page.
          </p>
        ) : (
          <ul className="workspace-directory">
            {workspaces.map((workspace) => {
              const kind = getWorkspaceKind(workspace.kind);
              return (
                <li
                  key={workspace.id}
                  className="workspace-directory-row"
                  {...(kind ? themeAttributes(kind.theme) : {})}
                >
                  <Link to={`/spaces/${workspace.space_id}/workspaces/${workspace.id}`}>
                    {kind && <span className="kind-card-icon">{kind.icon}</span>} {workspace.name}
                  </Link>
                  <span className="workspace-directory-meta">
                    {kind ? kind.label : 'Plain'} &middot;{' '}
                    <Link to={`/spaces/${workspace.space_id}`}>{workspace.space_title}</Link> &middot;{' '}
                    {workspace.member_count} {workspace.member_count === 1 ? 'Tool' : 'Tools'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default WorkspacesPage;
