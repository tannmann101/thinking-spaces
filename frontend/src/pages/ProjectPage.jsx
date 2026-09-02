// A Project's own dedicated page -- the Time family's equivalent of a
// Workspace (see WorkspacePage.jsx, which this closely mirrors), scoped
// specifically to the two Time Types a "goal/project" is actually
// about: Milestone and Session. Named "Project" rather than "Goal" to
// avoid colliding with a Space's own pre-existing `goal` field.
//
// A Milestone/Session still shows on the ordinary Space page too --
// joining a Project is additive, same principle Workspaces and
// Categories already follow.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSpace,
  getProject,
  renameProject,
  deleteProject,
  getBlocksForSpace,
  addBlockToSpace,
  deleteBlockApi,
  updateBlockProject,
  getBlockReport,
  getProjectReport,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { newSessionSpec } from '../blocks/sessionActions.js';
import BlockPreview from '../blocks/BlockPreview.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import ReportButton from '../components/ReportButton.jsx';
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
        className="inline-title-field"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => event.key === 'Enter' && finish()}
      />
    );
  }
  return (
    <span
      className="editable"
      onClick={() => {
        setDraft(project.name);
        setEditing(true);
      }}
    >
      {project.name}
    </span>
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
  const { spaceId, projectId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [space, setSpace] = useState(null);
  const [project, setProject] = useState(null);
  const [blocks, setBlocks] = useState(null);
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
    getSpace(spaceId).then(setSpace).catch((err) => setError(err.message));
    getProject(projectId).then(setProject).catch((err) => setError(err.message));
    getBlocksForSpace(spaceId).then(setBlocks).catch((err) => setError(err.message));
  }, [spaceId, projectId]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  // oxlint's set-state-in-effect warning fires on setHighlightActive(true)
  // below -- deliberately accepted, same reasoning SpacePage.jsx's own
  // copy of this effect documents: it's synchronizing with a real
  // external system (the DOM element found via getElementById/
  // scrollIntoView), not deriving state that belongs in render.
  useEffect(() => {
    if (!flashId || !blocks || lastFlashedId.current === flashId) return;
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
  }, [flashId, blocks]);

  async function handleAddMilestone() {
    const block = await addBlockToSpace(spaceId, {
      type: 'milestone',
      content: { label: '', targetDate: null, reached: false, reachedAt: null, note: '' },
      properties: { projectId },
    });
    refetchAll();
    if (block) flashBlock(block.id);
  }

  async function handleStartSession() {
    const block = await addBlockToSpace(spaceId, newSessionSpec({ projectId }));
    refetchAll();
    if (block) flashBlock(block.id);
  }

  async function handleRemoveFromProject(block) {
    await updateBlockProject(block.id, null);
    refetchAll();
  }

  async function handlePullIn(block) {
    await updateBlockProject(block.id, projectId);
    refetchAll();
    flashBlock(block.id);
  }

  async function handleDeleteBlock(blockId) {
    if (!(await confirm('Remove this entry entirely? This cannot be undone.'))) return;
    await deleteBlockApi(blockId);
    refetchAll();
  }

  // Deleting a Project only removes the Project itself -- its
  // Milestones/Sessions stay exactly where they were on the ordinary
  // Space page, same as removing a Workspace never deletes its Tools.
  async function handleDeleteProject() {
    if (!(await confirm(`Delete the Project "${project.name}"? Its Milestones and Sessions stay on the Space.`))) {
      return;
    }
    await deleteProject(projectId);
    navigate(`/spaces/${spaceId}`);
  }

  const memberBlocks = (blocks || []).filter(
    (block) => PROJECT_TYPES.includes(block.type) && block.properties?.projectId === projectId
  );
  const nonMemberBlocks = (blocks || []).filter(
    (block) => PROJECT_TYPES.includes(block.type) && block.properties?.projectId !== projectId
  );

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      {space && (
        <Link to={`/spaces/${spaceId}`} className="back-link">
          &larr; Back to {space.title}
        </Link>
      )}

      {error && <p>Could not load Project: {error}</p>}
      {!error && (!space || !project) && <p>Loading...</p>}

      {space && project && (
        <>
          <h1 className="workspace-title">
            <EditableProjectName project={project} onChanged={refetchAll} />
          </h1>
          <p className="workspace-subtitle">A Project inside &ldquo;{space.title}&rdquo;</p>
          <ProjectProgress memberBlocks={memberBlocks} />
          <div className="report-row">
            <ReportButton fetchReport={() => getProjectReport(projectId)} label="Project Report" />
          </div>

          {memberBlocks.length === 0 && (
            <p>Nothing assigned to this Project yet -- add a Milestone or Session below, or pull one in already on the Space.</p>
          )}

          {memberBlocks.length > 0 && (
            <div className="block-feed workspace-block-feed">
              {memberBlocks.map((block) => {
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
              })}
            </div>
          )}

          <h2>Add to this Project</h2>
          <p>
            <button type="button" className="btn-ghost-small" onClick={handleAddMilestone}>
              + New Milestone
            </button>{' '}
            <button
              type="button"
              className="btn-ghost-small"
              onClick={handleStartSession}
              title="Create and immediately start a new Session for this Project"
            >
              ▶ Start a Session
            </button>
          </p>

          {nonMemberBlocks.length > 0 && (
            <>
              <h2>Pull in a Milestone or Session already on this Space</h2>
              <ul className="checkbox-list">
                {nonMemberBlocks.map((block) => (
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
