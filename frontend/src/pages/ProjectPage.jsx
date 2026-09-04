// A Project's own dedicated page.
//
// A Project is standalone -- it has no Space of its own, so it has no
// Space feed to read from either. Its members are gathered by
// projectId across every Space (getProjectBlocks), which is what lets
// one Project hold work happening in several places at once. Members
// are grouped by the Space they actually live in, so the page always
// says where a checkpoint or a timed sitting really is.
//
// Adding work therefore needs to know *which* Space to add it to --
// hence the Space picker below, which governs both "add new" and "pull
// in something already there". A Milestone/Session still shows on its
// own Space page too: joining a Project is additive, the same
// principle Workspaces and Categories already follow.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSpaces,
  getProject,
  getProjectBlocks,
  getGoals,
  renameProject,
  setProjectGoal,
  deleteProject,
  getBlocksForSpace,
  addBlockToSpace,
  deleteBlockApi,
  updateBlockProject,
  getBlockReport,
  getProjectReport,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { resolveBlockTheme, themeAttributes } from '../theme/itemTheme.js';
import { viewRegistry } from '../registry/views.js';
import { newSessionSpec } from '../blocks/sessionActions.js';
import BlockPreview from '../blocks/BlockPreview.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import ReportButton from '../components/ReportButton.jsx';
import PageActions from '../components/PageActions.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const PROJECT_TYPES = ['milestone', 'session'];

function EditableProjectName({ project, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  async function finish() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === project.name) return;
    await renameProject(project.id, trimmed);
    onChanged();
  }

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        autoFocus
        aria-label="Project name"
        className="inline-title-field"
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
        setDraft(project.name);
        setEditing(true);
      }}
    >
      {project.name}
    </button>
  );
}

// Which Goal this Project serves -- a plain <select>, since a Project
// serves at most one Goal, the same single-valued shape a Milestone's
// own Project membership uses.
function GoalPicker({ project, goals, onChanged }) {
  return (
    <p className="workspace-subtitle">
      <label>
        Serving:{' '}
        <select
          value={project.goal_id || ''}
          onChange={async (event) => {
            await setProjectGoal(project.id, event.target.value || null);
            onChanged();
          }}
        >
          <option value="">(no Goal)</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.name}
            </option>
          ))}
        </select>
      </label>{' '}
      <Link to="/goals">Manage Goals</Link>
    </p>
  );
}

// "N of M Milestones reached, N min logged across Sessions" -- computed
// fresh from the member blocks already fetched, same "no new backend
// aggregation needed" reasoning WorkspacePage's own member list uses.
function ProjectProgress({ memberBlocks }) {
  const milestones = memberBlocks.filter((block) => block.type === 'milestone');
  const sessions = memberBlocks.filter((block) => block.type === 'session');
  if (milestones.length === 0 && sessions.length === 0) return null;
  const reached = milestones.filter((block) => block.content.reached).length;
  const totalMinutes = sessions.reduce((sum, block) => sum + (block.content.durationMinutes || 0), 0);
  const running = sessions.some((block) => Boolean(block.content.startedAt) && !block.content.endedAt);

  return (
    <p className="workspace-subtitle">
      {milestones.length > 0 && <>{reached} of {milestones.length} Milestone{milestones.length === 1 ? '' : 's'} reached</>}
      {milestones.length > 0 && sessions.length > 0 && ' -- '}
      {sessions.length > 0 && (
        <>
          {totalMinutes} min logged across {sessions.length} Session{sessions.length === 1 ? '' : 's'}
          {running && ' (one running now)'}
        </>
      )}
    </p>
  );
}

function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [project, setProject] = useState(null);
  const [memberBlocks, setMemberBlocks] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [goals, setGoals] = useState([]);
  // Which Space new work goes into, and which Space's existing
  // Milestones/Sessions are offered to pull in.
  const [targetSpaceId, setTargetSpaceId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState(null);
  usePageTitle(project?.name);
  // Same flash-on-add mechanism as SpacePage.jsx/WorkspacePage.jsx --
  // see SpacePage.jsx's own comment for the full reasoning.
  const [flashId, setFlashId] = useState(null);
  const [highlightActive, setHighlightActive] = useState(false);
  const lastFlashedId = useRef(null);

  function flashBlock(blockId) {
    lastFlashedId.current = null;
    setFlashId(blockId);
  }

  const refetchAll = useCallback(() => {
    getProject(projectId).then(setProject).catch((err) => setError(err.message));
    getProjectBlocks(projectId).then(setMemberBlocks).catch((err) => setError(err.message));
  }, [projectId]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  useEffect(() => {
    getSpaces().then(setSpaces).catch(() => setSpaces([]));
    getGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  // What's already on the chosen Space and not yet in this Project.
  // Nothing is cleared here when no Space is picked -- a stale list
  // from a previously-picked Space is filtered out at render by its
  // own space_id instead, which keeps this effect free of a
  // synchronous setState it doesn't need.
  const refetchCandidates = useCallback(() => {
    if (!targetSpaceId) return;
    getBlocksForSpace(targetSpaceId)
      .then((blocks) =>
        setCandidates(
          blocks.filter(
            (block) => PROJECT_TYPES.includes(block.type) && block.properties?.projectId !== projectId
          )
        )
      )
      .catch(() => setCandidates([]));
  }, [targetSpaceId, projectId]);

  useEffect(() => {
    refetchCandidates();
  }, [refetchCandidates]);

  // oxlint's set-state-in-effect warning fires on setHighlightActive(true)
  // below -- deliberately accepted, same reasoning SpacePage.jsx's own
  // copy of this effect documents: it's synchronizing with a real
  // external system (the DOM element found via getElementById/
  // scrollIntoView), not deriving state that belongs in render.
  useEffect(() => {
    if (!flashId || !memberBlocks || lastFlashedId.current === flashId) return;
    const el = document.getElementById(`block-${flashId}`);
    if (!el) return;
    lastFlashedId.current = flashId;
    setHighlightActive(true);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightActive(false), 2500);
    return () => {
      clearTimeout(timer);
      lastFlashedId.current = null;
    };
  }, [flashId, memberBlocks]);

  function afterChange(block) {
    refetchAll();
    refetchCandidates();
    if (block) flashBlock(block.id);
  }

  async function handleAddMilestone() {
    const block = await addBlockToSpace(targetSpaceId, {
      type: 'milestone',
      content: { label: '', targetDate: null, reached: false, reachedAt: null, note: '' },
      properties: { projectId },
    });
    afterChange(block);
  }

  async function handleStartSession() {
    const block = await addBlockToSpace(targetSpaceId, newSessionSpec({ projectId }));
    afterChange(block);
  }

  async function handleRemoveFromProject(block) {
    await updateBlockProject(block.id, null);
    afterChange(null);
  }

  async function handlePullIn(block) {
    await updateBlockProject(block.id, projectId);
    afterChange(block);
  }

  async function handleDeleteBlock(blockId) {
    if (!(await confirm('Remove this entry entirely? This cannot be undone.'))) return;
    await deleteBlockApi(blockId);
    afterChange(null);
  }

  // Deleting a Project only removes the Project itself -- its
  // Milestones/Sessions stay exactly where they were on their own Space
  // pages, same as removing a Workspace never deletes its Tools.
  async function handleDeleteProject() {
    if (!(await confirm(`Delete the Project "${project.name}"? Its Milestones and Sessions stay on their Spaces.`))) {
      return;
    }
    await deleteProject(projectId);
    navigate('/projects');
  }

  // Grouped by the Space each member actually lives in -- the whole
  // point of a Project spanning Spaces is being able to see that.
  const bySpace = new Map();
  (memberBlocks || []).forEach((block) => {
    if (!bySpace.has(block.space_id)) {
      bySpace.set(block.space_id, { title: block.spaceTitle, blocks: [] });
    }
    bySpace.get(block.space_id).blocks.push(block);
  });

  const shownCandidates = candidates.filter((block) => block.space_id === targetSpaceId);

  function renderBlock(block) {
    const entry = blockRegistry[block.type];
    const Component = entry?.component;
    const applicableViews = Object.entries(viewRegistry).filter(([, view]) => view.appliesTo(block));
    return (
      <div
        key={`${block.id}-${block.updated_at}`}
        id={`block-${block.id}`}
        className="block-row"
        data-family={entry?.family}
        data-highlighted={highlightActive && block.id === flashId ? 'true' : undefined}
        {...themeAttributes(resolveBlockTheme(block))}
      >
        {entry && (
          <p className="block-type-tag">
            {entry.icon && <span className="block-type-icon">{entry.icon}</span>}
            {entry.label}
          </p>
        )}
        {Component ? (
          <Component block={block} onBlocksChanged={refetchAll} />
        ) : (
          <p>Unknown entry type: {block.type}</p>
        )}
        {applicableViews.length > 0 && (
          <div className="view-grid">
            {applicableViews.map(([key, view]) => (
              <view.component key={key} block={block} />
            ))}
          </div>
        )}
        <div className="block-report-row">
          <ReportButton fetchReport={() => getBlockReport(block.id)} />
        </div>
        <div className="block-controls">
          <button type="button" className="btn-ghost-small" onClick={() => handleRemoveFromProject(block)}>
            Remove from Project
          </button>
          <button type="button" className="btn-ghost-small" onClick={() => handleDeleteBlock(block.id)}>
            Delete entry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Link to="/projects" className="back-link">
          &larr; All Projects
        </Link>

        {error && <p>Could not load Project: {error}</p>}
        {!error && (!project || !memberBlocks) && <p>Loading...</p>}

        {project && memberBlocks && (
          <>
            <h1 className="workspace-title">
              <EditableProjectName project={project} onChanged={refetchAll} />
            </h1>
            <GoalPicker project={project} goals={goals} onChanged={refetchAll} />
            <ProjectProgress memberBlocks={memberBlocks} />
            <PageActions>
              <ReportButton fetchReport={() => getProjectReport(projectId)} label="Project Report" tier="page" />
            </PageActions>

            {memberBlocks.length === 0 && (
              <p>
                Nothing assigned to this Project yet &mdash; pick a Space below, then add a Milestone or
                Session, or pull in one already there.
              </p>
            )}

            {[...bySpace.entries()].map(([spaceId, group]) => (
              <section key={spaceId}>
                <h2 className="project-space-heading">
                  <Link to={`/spaces/${spaceId}`}>{group.title}</Link>
                </h2>
                <div className="block-feed workspace-block-feed">{group.blocks.map(renderBlock)}</div>
              </section>
            ))}

            <h2>Add to this Project</h2>
            <p>
              <label>
                In Space:{' '}
                <select value={targetSpaceId} onChange={(event) => setTargetSpaceId(event.target.value)}>
                  <option value="">(pick a Space)</option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.title}
                    </option>
                  ))}
                </select>
              </label>
            </p>
            <p>
              <button
                type="button"
                className="btn-ghost-small"
                onClick={handleAddMilestone}
                disabled={!targetSpaceId}
              >
                + New Milestone
              </button>{' '}
              <button
                type="button"
                className="btn-ghost-small"
                onClick={handleStartSession}
                disabled={!targetSpaceId}
                title="Create and immediately start a new Session for this Project"
              >
                ▶ Start a Session
              </button>
            </p>

            {shownCandidates.length > 0 && (
              <>
                <h2>Pull in a Milestone or Session already on that Space</h2>
                <ul className="checkbox-list">
                  {shownCandidates.map((block) => (
                    <li key={block.id} className="block-row">
                      <BlockPreview block={block} />
                      <button type="button" className="btn-ghost-small" onClick={() => handlePullIn(block)}>
                        + Pull in
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="danger-zone">
              <button type="button" className="btn-danger" onClick={handleDeleteProject}>
                Delete this Project
              </button>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default ProjectPage;
