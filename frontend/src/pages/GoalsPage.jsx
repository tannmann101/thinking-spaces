// Every Goal, and its reach.
//
// A Goal is a pursuit several Spaces can be working toward at once. In
// the person's own framing: "projects are personally initiated, goals
// are revealed as relevant pursuits" -- so a Goal deliberately has no
// Milestones or Sessions of its own. Give it those and it just becomes
// a Project with a different name.
//
// That's also why a Goal gets no dedicated page of its own the way a
// Project does: a Project has real content (its assigned entries) that
// needs somewhere to live, whereas everything a Goal has -- its note,
// which Spaces work toward it, which Projects serve it -- fits on the
// card here. A page per Goal would show nothing this doesn't.
//
// This replaces the single free-text "Working toward" line a Space used
// to carry, which could only ever hold one thing and could never be
// shared with another Space.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import PageActions from '../components/PageActions.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// Click-to-edit, same pattern as every other editable field in the app.
function EditableField({ value, placeholder, label, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  async function finish() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value || '')) return;
    await onSave(trimmed);
  }

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        autoFocus
        aria-label={label}
        className="field-full field-inherit-font"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => event.key === 'Enter' && finish()}
      />
    );
  }
  return (
    <button
      type="button"
      className="editable"
      onClick={() => {
        setDraft(value || '');
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}

function GoalCard({ goal, onChanged, onDelete }) {
  return (
    <li className="goal-card">
      <div className="space-index-head">
        <span className="space-index-title">
          <EditableField
            value={goal.name}
            label="Goal name"
            placeholder="(untitled)"
            onSave={(name) => updateGoal(goal.id, { name }).then(onChanged)}
          />
        </span>
      </div>

      <p className="synthesis-card-meta">
        <EditableField
          value={goal.note}
          label="Goal note"
          placeholder="+ why this matters"
          onSave={(note) => updateGoal(goal.id, { note }).then(onChanged)}
        />
      </p>

      <p className="synthesis-card-label">
        Worked toward by:{' '}
        {goal.spaces.length === 0 ? (
          <span className="empty-note">no Spaces yet</span>
        ) : (
          goal.spaces.map((space, index) => (
            <span key={space.spaceId}>
              {index > 0 && ', '}
              <Link to={`/spaces/${space.spaceId}`}>{space.spaceTitle}</Link>
            </span>
          ))
        )}
      </p>

      <p className="synthesis-card-label">
        Served by:{' '}
        {goal.projects.length === 0 ? (
          <span className="empty-note">no Projects yet</span>
        ) : (
          goal.projects.map((project, index) => (
            <span key={project.projectId}>
              {index > 0 && ', '}
              <Link to={`/projects/${project.projectId}`}>{project.projectName}</Link>
            </span>
          ))
        )}
      </p>

      <button type="button" className="btn-ghost-small" onClick={() => onDelete(goal)}>
        Delete Goal
      </button>
    </li>
  );
}

function GoalsPage() {
  usePageTitle('Goals');
  const { confirm } = useConfirmDialog();
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');

  function refetch() {
    getGoals()
      .then(setGoals)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetch();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await createGoal(trimmed);
    setName('');
    refetch();
  }

  // Deleting a Goal leaves any Space or Project still pointing at it
  // with a stale id nothing resolves to -- the same graceful handling a
  // removed Workspace or Category already gets.
  async function handleDelete(goal) {
    if (!(await confirm(`Delete the Goal "${goal.name}"? Spaces and Projects that named it stay exactly as they are.`))) {
      return;
    }
    await deleteGoal(goal.id);
    refetch();
  }

  return (
    <div className="app-shell">
      <Sidebar current="goals" />
      <main className="app-content">
        <h1>Goals</h1>
        <p>
          Pursuits you found yourself heading toward, rather than work you set out on. A Goal has no
          checkpoints of its own &mdash; what it has is reach: the Spaces working toward it and the{' '}
          <Link to="/projects">Projects</Link> serving it.
        </p>

        <PageActions>
          <Link to="/projects" className="btn">
            Projects
          </Link>
        </PageActions>

        <form onSubmit={handleCreate} className="stacked-field">
          <input
            type="text"
            value={name}
            placeholder="Name a pursuit you keep coming back to"
            onChange={(event) => setName(event.target.value)}
            className="field-width-60"
          />{' '}
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            + New Goal
          </button>
        </form>

        {error && <p>Could not load Goals: {error}</p>}
        {!error && !goals && <p>Loading...</p>}

        {goals && goals.length === 0 && (
          <p className="empty-note">
            None yet. Name one above, then mark a Space as working toward it from that Space&rsquo;s own page.
          </p>
        )}

        {goals && goals.length > 0 && (
          <>
            <p className="resource-summary">
              {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
            </p>
            <ul className="synthesis-grid">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onChanged={refetch} onDelete={handleDelete} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default GoalsPage;
