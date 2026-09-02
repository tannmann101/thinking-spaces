// A Workspace's own dedicated page -- the "pop into a tool-specific
// environment" this whole concept is about. Reuses the exact same
// blockRegistry/viewRegistry components the Space page's flat feed
// uses (no bespoke per-Tool redesign yet -- see CLAUDE.md for why that's
// deliberately a later, separate pass), just gives the Tools assembled
// into this Workspace a page of their own instead of sharing space with
// everything else on the Space.
//
// A block still shows on the ordinary Space page too -- joining a
// Workspace is additive, same principle Categories already follow, so
// nothing becomes harder to find or edit just because it's also part of
// a Workspace.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSpace,
  getWorkspace,
  renameWorkspace,
  deleteWorkspace,
  getBlocksForSpace,
  addBlockToSpace,
  deleteBlockApi,
  updateBlockWorkspaces,
  getWorkspaceReport,
  getBlockReport,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import NewBlockForm from '../blocks/NewBlockForm.jsx';
import BlockPreview from '../blocks/BlockPreview.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import ReportButton from '../components/ReportButton.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function EditableWorkspaceName({ workspace, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.name);

  async function finish() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await renameWorkspace(workspace.id, trimmed);
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
        setDraft(workspace.name);
        setEditing(true);
      }}
    >
      {workspace.name}
    </span>
  );
}

function WorkspacePage() {
  const { spaceId, workspaceId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [space, setSpace] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(null);
  usePageTitle(workspace?.name);
  // Focus mode: set to a block's id to hide every other block (and the
  // add/pull-in/delete sections below) and show just that one, larger --
  // "nothing but prose to look at." Only Text currently reads the
  // resulting `focused`/`onFocus` props (via its Focus toggle), but
  // every Component gets them uniformly rather than special-casing by
  // block type here.
  const [focusedBlockId, setFocusedBlockId] = useState(null);
  // Flashes a just-created (or pulled-in) block's row so it doesn't just
  // silently appear in a feed that may already have several Tools in
  // it -- same mechanism SpacePage.jsx uses for its own feed, see that
  // file's own comment for the full reasoning. lastFlashedId (a ref)
  // guards against re-flashing the same id on an unrelated later
  // refetch.
  const [flashId, setFlashId] = useState(null);
  const [highlightActive, setHighlightActive] = useState(false);
  const lastFlashedId = useRef(null);

  function flashBlock(blockId) {
    lastFlashedId.current = null;
    setFlashId(blockId);
  }

  const refetchAll = useCallback(() => {
    getSpace(spaceId).then(setSpace).catch((err) => setError(err.message));
    getWorkspace(workspaceId).then(setWorkspace).catch((err) => setError(err.message));
    getBlocksForSpace(spaceId).then(setBlocks).catch((err) => setError(err.message));
  }, [spaceId, workspaceId]);

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

  // A new block created from inside a Workspace joins it automatically
  // -- you're already here for a reason, so there's no separate picker
  // step for "which Workspace" the way there is for Categories (where
  // several already exist Space-wide and any could apply). The Space's
  // own Categories are still offered, same as the ordinary feed.
  async function handleAddBlock(spec) {
    const block = await addBlockToSpace(spaceId, {
      ...spec,
      properties: { ...spec.properties, workspaces: [workspaceId] },
    });
    refetchAll();
    if (block) flashBlock(block.id);
  }

  async function handleRemoveFromWorkspace(block) {
    const current = block.properties?.workspaces || [];
    await updateBlockWorkspaces(block.id, current.filter((w) => w !== workspaceId));
    refetchAll();
  }

  // A one-way "add" rather than a toggle: the block simply moves from
  // this "not yet in this Workspace" list into the assembled feed above
  // (and can always be removed again from there) -- a checkbox would
  // imply a persistent checked state this list never actually holds.
  async function handlePullIn(block) {
    const current = block.properties?.workspaces || [];
    if (current.includes(workspaceId)) return;
    await updateBlockWorkspaces(block.id, [...current, workspaceId]);
    refetchAll();
    flashBlock(block.id);
  }

  async function handleDeleteBlock(blockId) {
    if (!(await confirm('Remove this entry entirely? This cannot be undone.'))) return;
    await deleteBlockApi(blockId);
    refetchAll();
  }

  // Deleting a Workspace only removes the Workspace itself -- its
  // blocks stay exactly where they were on the ordinary Space page,
  // same as removing a Category never deletes the blocks filed under it.
  async function handleDeleteWorkspace() {
    if (!(await confirm(`Delete the Workspace "${workspace.name}"? Its Tools stay on the Space.`))) {
      return;
    }
    await deleteWorkspace(workspaceId);
    navigate(`/spaces/${spaceId}`);
  }

  const memberBlocks = (blocks || []).filter((block) =>
    (block.properties?.workspaces || []).includes(workspaceId)
  );
  const nonMemberBlocks = (blocks || []).filter(
    (block) => !(block.properties?.workspaces || []).includes(workspaceId)
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

      {error && <p>Could not load Workspace: {error}</p>}
      {!error && (!space || !workspace) && <p>Loading...</p>}

      {space && workspace && (
        <>
          {!focusedBlockId && (
            <>
              <h1 className="workspace-title">
                <EditableWorkspaceName workspace={workspace} onChanged={refetchAll} />
              </h1>
              <p className="workspace-subtitle">A Workspace inside &ldquo;{space.title}&rdquo;</p>
              <div className="report-row">
                <ReportButton fetchReport={() => getWorkspaceReport(workspaceId)} label="Workspace Report" />
              </div>
            </>
          )}

          {memberBlocks.length === 0 && (
            <p>Nothing assembled here yet -- add a Tool below, or pull in one already on the Space.</p>
          )}

          {memberBlocks.length > 0 && (
            <div className="block-feed workspace-block-feed">
              {memberBlocks
                .filter((block) => !focusedBlockId || block.id === focusedBlockId)
                .map((block) => {
                  const entry = blockRegistry[block.type];
                  // A Workspace is where a Tool gets its bespoke, more
                  // spacious environment -- workshopComponent, when the
                  // registry defines one for this Tool type, replaces the
                  // ordinary inline component just here. Falls back to the
                  // same component the flat feed uses for every Tool that
                  // hasn't gotten its own redesign yet.
                  const Component = entry?.workshopComponent || entry?.component;
                  const isFocused = focusedBlockId === block.id;
                  const applicableViews = Object.entries(viewRegistry).filter(([, view]) =>
                    view.appliesTo(block)
                  );
                  return (
                    <div
                      key={`${block.id}-${block.updated_at}`}
                      id={`block-${block.id}`}
                      className="block-row"
                      data-family={entry?.family}
                      data-highlighted={highlightActive && block.id === flashId ? 'true' : undefined}
                    >
                      {entry && !isFocused && (
                        <p className="block-type-tag">
                          {entry.icon && <span className="block-type-icon">{entry.icon}</span>}
                          {entry.label}
                        </p>
                      )}
                      {Component ? (
                        <Component
                          block={block}
                          onBlocksChanged={refetchAll}
                          focused={isFocused}
                          onFocus={setFocusedBlockId}
                        />
                      ) : (
                        <p>Unknown entry type: {block.type}</p>
                      )}
                      {!focusedBlockId && applicableViews.length > 0 && (
                        <div className="view-grid">
                          {applicableViews.map(([key, view]) => (
                            <view.component key={key} block={block} />
                          ))}
                        </div>
                      )}
                      {!focusedBlockId && (
                        <div className="block-report-row">
                          <ReportButton fetchReport={() => getBlockReport(block.id)} />
                        </div>
                      )}
                      {!focusedBlockId && (
                        <div className="block-controls">
                          <button
                            type="button"
                            className="btn-ghost-small"
                            onClick={() => handleRemoveFromWorkspace(block)}
                          >
                            Remove from Workspace
                          </button>
                          <button
                            type="button"
                            className="btn-ghost-small"
                            onClick={() => handleDeleteBlock(block.id)}
                          >
                            Delete entry
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {!focusedBlockId && (
            <>
              <h2>Add a new Tool to this Workspace</h2>
              <NewBlockForm onAdd={handleAddBlock} categories={space.categories} />

              {nonMemberBlocks.length > 0 && (
                <>
                  <h2>Pull in a Tool already on this Space</h2>
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
                <button type="button" className="btn-danger" onClick={handleDeleteWorkspace}>
                  Delete this Workspace
                </button>
              </p>
            </>
          )}
        </>
      )}
      </main>
    </div>
  );
}

export default WorkspacePage;
