// Every Project, wherever its work happens.
//
// A Project used to live inside one Space, which meant finding one
// required already remembering which Space it was in -- and a piece of
// work that genuinely spanned Spaces had to be split into two Projects
// that knew nothing about each other. Now a Project is standalone: its
// Spaces are derived from wherever its own Milestones and Sessions
// live, so this page can show what a Space page never could -- the
// whole of what you've taken on, what it's feeding, and how far it got.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProjects, getGoals, createProject } from '../api.js';
import PageActions from '../components/PageActions.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function ProjectCard({ project }) {
  const { milestoneCount, reachedCount, minutesLogged } = project;
  const progress = [
    milestoneCount > 0 && `${reachedCount} of ${milestoneCount} reached`,
    minutesLogged > 0 && `${minutesLogged} min logged`,
  ].filter(Boolean);

  return (
    <li className="project-card">
      <div className="space-index-head">
        <Link to={`/projects/${project.id}`} className="space-index-title">
          {project.name}
        </Link>
      </div>

      <p className="synthesis-card-meta">
        {project.goalName ? `Serving: ${project.goalName}` : 'not serving a Goal'}
        {progress.length > 0 && ` · ${progress.join(' · ')}`}
      </p>

      {project.spaces.length === 0 ? (
        // A Project with nothing assigned yet isn't broken, it just
        // hasn't been given any work -- worth saying so directly.
        <p className="empty-note">Nothing assigned yet.</p>
      ) : (
        <p className="synthesis-card-label">
          Work in:{' '}
          {project.spaces.map((space, index) => (
            <span key={space.spaceId}>
              {index > 0 && ', '}
              <Link to={`/spaces/${space.spaceId}`}>{space.spaceTitle}</Link>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function ProjectsPage() {
  usePageTitle('Projects');
  const [projects, setProjects] = useState(null);
  const [goals, setGoals] = useState([]);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [goalId, setGoalId] = useState('');

  function refetch() {
    getProjects()
      .then(setProjects)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetch();
    // A Goal is optional at creation, so a failure to load the list
    // shouldn't block making a Project -- it just means no Goal to pick.
    getGoals()
      .then(setGoals)
      .catch(() => setGoals([]));
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await createProject(trimmed, goalId || null);
    setName('');
    setGoalId('');
    refetch();
  }

  return (
    <div className="app-shell">
      <Sidebar current="projects" />
      <main className="app-content">
        <h1>Projects</h1>
        <p>
          Work you decided to take on &mdash; a Project is where a Milestone or Session belongs.
          Its Spaces are wherever its own entries live, so one Project can span several. A Goal
          (see <Link to="/goals">Goals</Link>) is the other half of this: the pursuit a Project serves.
        </p>

        <PageActions>
          <Link to="/goals" className="btn">
            Goals
          </Link>
        </PageActions>

        <form onSubmit={handleCreate} className="stacked-field">
          <input
            type="text"
            value={name}
            placeholder="New Project name"
            onChange={(event) => setName(event.target.value)}
            className="field-width-60"
          />{' '}
          <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
            <option value="">(no Goal yet)</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>{' '}
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            + New Project
          </button>
        </form>

        {error && <p>Could not load Projects: {error}</p>}
        {!error && !projects && <p>Loading...</p>}

        {projects && projects.length === 0 && (
          <p className="empty-note">
            None yet. Name one above, then assign a Milestone or Session to it from any Space.
          </p>
        )}

        {projects && projects.length > 0 && (
          <>
            <p className="resource-summary">
              {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
            </p>
            <ul className="synthesis-grid">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default ProjectsPage;
