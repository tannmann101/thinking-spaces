import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  getSpace,
  getBlocksForSpace,
  getBacklinksForSpace,
  getTrailEntries,
  addBlockToSpace,
  deleteBlockApi,
  reorderBlocksInSpace,
  updateSpace,
  updateBlockCategories,
  updateBlockWorkspaces,
  updateBlockTheme,
  getWorkspacesForSpace,
  createWorkspace,
  getSpaces,
  moveBlockToSpace,
  deleteSpace,
  getSpaceReport,
  getBlockReport,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import SpaceGlyph, { SPACE_STATUSES } from '../glyph/SpaceGlyph.jsx';
import ThemePicker from '../components/ThemePicker.jsx';
import { resolveBlockTheme, resolveSpaceTheme, themeAttributes } from '../theme/itemTheme.js';
import TrailSpine from '../trail/TrailSpine.jsx';
import NewBlockForm from '../blocks/NewBlockForm.jsx';
import { newSessionSpec } from '../blocks/sessionActions.js';
import ReportButton from '../components/ReportButton.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import PageActions from '../components/PageActions.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import EntryMenu from '../components/EntryMenu.jsx';

// Only renders when there's somewhere more specific to go back to than
// the Dashboard -- arriving here via a Reference/backlink from another
// Space (?from=<id>) -- since the sidebar's wordmark already covers "back to
// Dashboard" from every page; showing both here would just be two links
// doing the same job.
function BackLink() {
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const [fromSpace, setFromSpace] = useState(null);

  useEffect(() => {
    if (fromId) getSpace(fromId).then(setFromSpace).catch(() => setFromSpace(null));
  }, [fromId]);

  if (!fromId) return null;
  return (
    <Link to={`/spaces/${fromId}`} className="back-link">
      &larr; Back to {fromSpace ? fromSpace.title : '...'}
    </Link>
  );
}

// A Space's title, status, tags, and "working toward" goal are all
// ordinary click-to-edit surfaces on this page -- the same principle
// Pass 4 applied to blocks (add/remove/reorder feels like any other
// edit) extended to the Space's own properties, which previously
// couldn't be changed at all once the Space was created.

function EditableTitle({ space, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(space.title);

  async function finish() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === space.title) return;
    await updateSpace(space.id, { title: trimmed });
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
        setDraft(space.title);
        setEditing(true);
      }}
    >
      {space.title}
    </span>
  );
}

function StatusPill({ space, onChanged }) {
  async function cycle() {
    const next = SPACE_STATUSES[(SPACE_STATUSES.indexOf(space.status) + 1) % SPACE_STATUSES.length];
    await updateSpace(space.id, { status: next });
    onChanged();
  }

  return (
    <span
      className="status-pill status-pill-clickable"
      data-status={space.status}
      onClick={cycle}
      title={`Click to cycle: ${SPACE_STATUSES.join(' -> ')}`}
    >
      {space.status}
    </span>
  );
}

// This Space's own look. Replaces the old AccentPicker, which only ever
// set a small decorative mark on the glyph -- see theme/itemTheme.js for
// what a theme actually covers now and why the manual override is kept
// separate from the computed default.
function SpaceThemePicker({ space, onChanged }) {
  async function save(theme) {
    await updateSpace(space.id, { theme });
    onChanged();
  }

  return (
    <p className="category-row">
      <span className="category-row-label">Look:</span>
      <ThemePicker item={space} kind="space" onSave={save} />
    </p>
  );
}

// Shows at a glance whether this Space was brought in from outside the
// app (external -- a Resource) or produced by the app itself (internal
// -- a Synthesis, or anything later promoted to Resource status).
// Read-only here: origin is set once at creation (see
// CreateResource.jsx/CreateSynthesis.jsx), not editable in place --
// provenance is a fact about how a Space came to exist, not a property
// to be reassigned later.
function OriginBadge({ space }) {
  if (!space.origin) return null;
  return (
    <span
      className="origin-badge"
      data-origin={space.origin}
      title={space.origin === 'external' ? 'Brought in from outside the app' : 'Produced by the app itself'}
    >
      {space.origin === 'external' ? 'External' : 'Internal'}
    </span>
  );
}

// A mature Synthesis (origin: 'internal') can be explicitly promoted
// to also carry the "resource" tag, once it's settled enough to be
// cited elsewhere the way an external Resource is. Deliberately just a
// tag addition -- no new Space, no content changes -- since promoting
// doesn't change what the Space *is*, just that it's now also
// discoverable as a Resource (the Dashboard's Resources digest already
// reads tag membership, so promoting needs no new plumbing). Scoped to
// Syntheses only for now: a raw Space full of scattered Work items
// isn't "a thing" yet the way a compiled Synthesis is -- Synthesis is
// already the maturation step this builds on.
function PromoteToResource({ space, onChanged }) {
  if (space.origin !== 'internal' || !space.tags.includes('synthesis') || space.tags.includes('resource')) {
    return null;
  }

  async function promote() {
    await updateSpace(space.id, { tags: [...space.tags, 'resource'] });
    onChanged();
  }

  return (
    <p className="promote-row">
      <button type="button" className="btn-ghost-small" onClick={promote}>
        ↑ Promote to Resource
      </button>{' '}
      <span className="promote-hint">mark this Synthesis as settled enough to cite elsewhere, like a Resource</span>
    </p>
  );
}

function TagEditor({ space, onChanged }) {
  const [newTag, setNewTag] = useState('');

  async function addTag(event) {
    event.preventDefault();
    const tag = newTag.trim().toLowerCase();
    setNewTag('');
    if (!tag || space.tags.includes(tag)) return;
    await updateSpace(space.id, { tags: [...space.tags, tag] });
    onChanged();
  }

  async function removeTag(tag) {
    await updateSpace(space.id, { tags: space.tags.filter((t) => t !== tag) });
    onChanged();
  }

  return (
    <p className="tag-row">
      {space.tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}{' '}
          <button type="button" className="editable-toggle" onClick={() => removeTag(tag)} title="Remove tag">
            ✕
          </button>
        </span>
      ))}
      <form onSubmit={addTag} className="tag-add-form">
        <input
          type="text"
          value={newTag}
          placeholder="+ tag"
          onChange={(event) => setNewTag(event.target.value)}
        />
      </form>
    </p>
  );
}

// A Space's own Categories -- freely-named facets of whatever this
// Space is trying to understand (e.g. "Financial Impact", "Risk
// Tolerance"), distinct from tags (which categorize the Space itself
// among every other Space). Categories are defined here, at the Space
// level; individual blocks then get filed under any number of them
// (see BlockCategoryPicker below) -- one thing can sit under several
// facets of the same topic at once, which is the whole point.
function CategoryManager({ space, onChanged }) {
  const [newCategory, setNewCategory] = useState('');

  async function addCategory(event) {
    event.preventDefault();
    const category = newCategory.trim();
    setNewCategory('');
    if (!category || space.categories.includes(category)) return;
    await updateSpace(space.id, { categories: [...space.categories, category] });
    onChanged();
  }

  async function removeCategory(category) {
    await updateSpace(space.id, { categories: space.categories.filter((c) => c !== category) });
    onChanged();
  }

  return (
    <p className="category-row">
      <span className="category-row-label">Categories:</span>
      {space.categories.map((category) => (
        <span key={category} className="category-chip">
          {category}{' '}
          <button
            type="button"
            className="editable-toggle"
            onClick={() => removeCategory(category)}
            title="Remove category"
          >
            ✕
          </button>
        </span>
      ))}
      <form onSubmit={addCategory} className="category-add-form">
        <input
          type="text"
          value={newCategory}
          placeholder="+ category"
          onChange={(event) => setNewCategory(event.target.value)}
        />
      </form>
    </p>
  );
}


// A real target date for the Space as a whole -- distinct from a List
// item's own `reviewBy` (which means "come back and reconsider this,"
// not "this is due"). A native date input, since a free-text field for
// a date invites exactly the ambiguity a date is supposed to remove.
function DueDate({ space, onChanged }) {
  async function setDueDate(value) {
    await updateSpace(space.id, { dueDate: value || null });
    onChanged();
  }

  return (
    <p className={`due-date-row${space.isOverdue ? ' due-date-overdue' : ''}`}>
      Due:{' '}
      <input type="date" value={space.due_date || ''} onChange={(event) => setDueDate(event.target.value)} />
      {space.isOverdue && <span className="overdue-badge">Overdue</span>}
    </p>
  );
}

// "An honest picture of where the thinking currently stands" -- not a
// score, just which of the four Skeleton lanes have anything in them.
// Only renders once at least one lane block exists for this Space.
// Uses each lane block's own laneLabel (not a generic default list),
// since a Space Type can relabel lanes -- Person-Reflection's "What I
// Understand" instead of "Premises", for instance. SKELETON_LANE_LABELS
// is used only for canonical key order, not for the displayed text.
function SkeletonCompletenessStrip({ blocks }) {
  const byLaneKey = new Map(
    blocks
      .filter((block) => block.type === 'list' && block.properties?.skeletonLane)
      .map((block) => [block.properties.skeletonLane, block])
  );
  if (byLaneKey.size === 0) return null;

  return (
    <p className="skeleton-strip">
      Skeleton:{' '}
      {SKELETON_LANE_LABELS.map(({ key }, index) => {
        const block = byLaneKey.get(key);
        if (!block) return null;
        const filled = (block.content.items || []).length > 0;
        return (
          <span key={key}>
            {index > 0 && ' · '}
            {block.content.laneLabel} {filled ? '●' : '○'}
          </span>
        );
      })}
    </p>
  );
}

// Which of the Space's own Categories this one block belongs to. Only
// shows up once the Space has defined at least one Category -- with
// none defined there's nothing to file anything under yet, same as the
// filter strip below. Toggling a chip is the only way to assign one;
// new Category names are only ever created via CategoryManager, so a
// block can't accidentally invent a facet that doesn't apply Space-wide.
function BlockCategoryPicker({ block, spaceCategories, onChanged }) {
  if (spaceCategories.length === 0) return null;
  const current = block.properties?.categories || [];

  async function toggle(category) {
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    await updateBlockCategories(block.id, next);
    onChanged();
  }

  return (
    <p className="block-category-row">
      {spaceCategories.map((category) => (
        <span
          key={category}
          className={`category-chip category-chip-toggle${
            current.includes(category) ? ' category-chip-active' : ''
          }`}
          onClick={() => toggle(category)}
          title={current.includes(category) ? `Remove from ${category}` : `File under ${category}`}
        >
          {category}
        </span>
      ))}
    </p>
  );
}

// A Workspace is a deliberately assembled, named environment inside
// this Space -- distinct from a Category (a free-standing facet name,
// no page of its own): a Workspace is a real thing with a dedicated
// page you navigate into, where its assigned Tools get room to work
// together. This lists the Space's existing Workspaces as cards to open
// and lets you start a new one -- creating one is exactly as ordinary
// an action as adding a block or a Category, no separate mode for it.
function WorkspaceList({ space, workspaces, onChanged }) {
  const [newName, setNewName] = useState('');

  async function addWorkspace(event) {
    event.preventDefault();
    const name = newName.trim();
    setNewName('');
    if (!name) return;
    await createWorkspace(space.id, name);
    onChanged();
  }

  return (
    <div className="workspace-section">
      {/* No heading of its own: the wrapping <details><summary> in
          SpacePage now says "Workspaces", so an inner <h2> would just
          repeat it -- the same duplication TrailSpine's own heading was
          removed for. */}
      <p>Assemble Tools together into a dedicated environment for focused work.</p>
      {workspaces.length > 0 && (
        <div className="workspace-grid">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              to={`/spaces/${space.id}/workspaces/${workspace.id}`}
              className="workspace-card"
            >
              <h3>{workspace.name}</h3>
            </Link>
          ))}
        </div>
      )}
      <form onSubmit={addWorkspace} className="workspace-add-form">
        <input
          type="text"
          value={newName}
          placeholder="+ New Workspace"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="btn-ghost-small" disabled={!newName.trim()}>
          Create
        </button>
      </form>
    </div>
  );
}


// once the Space has at least one Workspace, same zero-state reasoning
// as BlockCategoryPicker. Membership is stored as Workspace ids (see
// updateBlockWorkspaces), so this resolves each id against the Space's
// current Workspace list -- a since-deleted Workspace's id just quietly
// stops resolving to a chip, same as a removed Category would.
// Sending one entry to a different Space. Sits with the other per-entry
// controls rather than in the row of chips above them, because it isn't
// a property of the entry the way a Category is -- it's an
// action that takes the entry off this page.
//
// Hidden for a Skeleton section: those four lanes plus the articulation
// block *are* this Space's Skeleton, so one can't leave without putting
// a hole in it. The backend refuses too (see moveBlockToSpace); this
// just doesn't offer what would be turned down.
function BlockSpaceMover({ block, spaces, currentSpaceId, onMoved }) {
  if (block.properties?.skeletonLane) return null;
  const elsewhere = spaces.filter((space) => space.id !== currentSpaceId);
  if (elsewhere.length === 0) return null;

  async function move(event) {
    const targetSpaceId = event.target.value;
    if (!targetSpaceId) return;
    await moveBlockToSpace(block.id, targetSpaceId);
    onMoved();
  }

  // Resets to the placeholder on every render, so it reads as an action
  // you perform rather than a setting showing where the entry currently
  // lives -- which is the page you're already on.
  return (
    <select className="block-move-select" value="" onChange={move} aria-label="Move this entry to another Space">
      <option value="">Move to...</option>
      {elsewhere.map((space) => (
        <option key={space.id} value={space.id}>
          {space.title}
        </option>
      ))}
    </select>
  );
}

// Which Workspaces this one block has been assembled into. Only shows
// once the Space actually has a Workspace to join.
function BlockWorkspacePicker({ block, spaceWorkspaces, onChanged }) {
  if (spaceWorkspaces.length === 0) return null;
  const current = block.properties?.workspaces || [];

  async function toggle(workspaceId) {
    const next = current.includes(workspaceId)
      ? current.filter((w) => w !== workspaceId)
      : [...current, workspaceId];
    await updateBlockWorkspaces(block.id, next);
    onChanged();
  }

  return (
    <p className="block-workspace-row">
      {spaceWorkspaces.map((workspace) => (
        <span
          key={workspace.id}
          className={`workspace-chip workspace-chip-toggle${
            current.includes(workspace.id) ? ' workspace-chip-active' : ''
          }`}
          onClick={() => toggle(workspace.id)}
          title={
            current.includes(workspace.id)
              ? `Remove from ${workspace.name}`
              : `Add to ${workspace.name}`
          }
        >
          {workspace.name}
        </span>
      ))}
    </p>
  );
}

// Adaptive density: a quick scratch Space and a deep, months-long one
// shouldn't carry the same visual weight. True once any of the fields
// the details panel below holds has actually been set, or once
// promotion is something to act on -- a genuinely "light" Space (just
// a title, no metadata, nothing else touched) starts with that panel
// collapsed instead of expanded, so capturing a fast thought doesn't
// look and feel as heavy as a Space that's actually accumulated
// metadata. Computed once, from the Space as first loaded -- see the
// initialization effect in SpacePage below for why it isn't recomputed
// on every render.
// The one row for adding a Details field that isn't set yet. Nothing is
// hidden that holds anything -- this only offers what's currently empty,
// and disappears once everything has been set.
function AddDetail({ space, revealed, onReveal }) {
  const missing = [
    !space.theme && !revealed.has('theme') && ['theme', 'a look'],
    !space.due_date && !revealed.has('due') && ['due', 'a due date'],
    space.tags.length === 0 && !revealed.has('tags') && ['tags', 'tags'],
    space.categories.length === 0 && !revealed.has('categories') && ['categories', 'Categories'],
  ].filter(Boolean);
  if (missing.length === 0) return null;

  return (
    <p className="add-detail-row">
      {missing.map(([key, label]) => (
        <button key={key} type="button" className="btn-ghost-small" onClick={() => onReveal(key)}>
          + {label}
        </button>
      ))}
    </p>
  );
}

function spaceHasMetadata(space) {
  const isPromotable = space.origin === 'internal' && space.tags.includes('synthesis') && !space.tags.includes('resource');
  return Boolean(
    space.theme ||
      (space.goalIds || []).length > 0 ||
      space.due_date ||
      space.tags.length > 0 ||
      space.categories.length > 0 ||
      isPromotable
  );
}

// Same adaptive-density reasoning as spaceHasMetadata above, applied to
// the two other panels a coherence audit found should adapt the same
// way -- a Space that's never created a Workspace shouldn't show a
// full, empty boxed section by default (it used to, always, on every
// Space, forever -- a real bug this closes) and a Space with no Trail
// history yet shouldn't open onto an empty list.
function spaceHasOrganization(workspaces) {
  return workspaces.length > 0;
}

// Trail is never literally empty anymore -- every Space at least
// records its own creation -- so "has history" has to mean more than
// `length > 0` or this panel would always default open, quietly
// undoing the adaptive density it was given. A Space whose whole
// history is "you made this" still counts as nothing to look at yet.
function spaceHasHistory(trail) {
  return trail.some((entry) => entry.kind !== 'space_created');
}

function SpacePage() {
  const { id } = useParams();
  const { confirm: confirmDialog, promptToMatch } = useConfirmDialog();
  const navigate = useNavigate();
  const [space, setSpace] = useState(null);
  usePageTitle(space?.title);
  const [blocks, setBlocks] = useState(null);
  const [workspaces, setWorkspaces] = useState(null);
  const [allSpaces, setAllSpaces] = useState([]);
  const [backlinks, setBacklinks] = useState(null);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState(null);
  // null = show every block; a category name = focus on just that facet.
  // This is view-only state (not persisted) -- "zoom in on one aspect of
  // the topic" without hiding the multi-category chips on each block, so
  // switching back to "All" always shows the full, honest overlap again.
  const [activeCategory, setActiveCategory] = useState(null);
  // Same idea, but by Block type rather than topic -- Categories are
  // opt-in and only exist once you've named some, so a Space with none
  // defined (or a Category that doesn't happen to cover what you're
  // after) still had no way to say "just show me the Questions." Both
  // filters can be active together (AND, not either/or).
  const [activeType, setActiveType] = useState(null);
  // Native HTML5 drag, same as a List's own items.
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  // Which empty Details fields have been opened by hand this visit.
  const [revealed, setRevealed] = useState(new Set());
  // See spaceHasMetadata above. Initialized once, from the Space as
  // first loaded, not recomputed on every later render -- otherwise
  // React would fight a manual open/close toggle on the native
  // <details> below every time anything else on the page changed.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsInitialized = useRef(false);
  // Same pattern, for the Workspaces and Trail
  // panels the coherence audit added -- see spaceHasOrganization/
  // spaceHasHistory above.
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const organizeInitialized = useRef(false);
  const [trailOpen, setTrailOpen] = useState(false);
  const trailInitialized = useRef(false);
  // Deep-linking to one specific entry -- a Dashboard/Log/Insights
  // digest that's really about one block (an overdue reviewBy item, a
  // due Milestone, an open Tension) previously always landed you on the
  // Space as a whole, leaving you to hunt for the thing that actually
  // brought you here. `?highlight=<blockId>` in the URL names it; once
  // the feed has loaded, this scrolls that entry into view and gives it
  // a brief highlight, then clears itself -- the URL param stays (so
  // reloading/sharing the link still works), only the visual flash is
  // one-shot.
  //
  // The cohesion-pass audit found a second, related gap: creating or
  // meaningfully changing a block on an already-open Space had no
  // spatial anchor at all -- just a corner toast (see Toast.jsx), with
  // the actual new/changed row left to blend into a long feed. flashId
  // generalizes the same mechanism to cover both: seeded from the URL
  // param on load, and settable directly (via flashBlock, below) right
  // after an in-page create/update resolves. lastFlashedId (a ref, not
  // state -- it doesn't need to trigger a render) tracks which id this
  // has already scrolled-and-flashed, since `blocks` refetches on every
  // edit and the effect below re-runs each time; without it, an
  // unrelated edit elsewhere on the page would re-trigger the same old
  // flash.
  const [searchParams] = useSearchParams();
  const highlightBlockId = searchParams.get('highlight');
  const [flashId, setFlashId] = useState(highlightBlockId);
  const [highlightActive, setHighlightActive] = useState(Boolean(highlightBlockId));
  const lastFlashedId = useRef(null);

  function flashBlock(blockId) {
    lastFlashedId.current = null;
    setFlashId(blockId);
  }

  const refetchTrail = useCallback(() => {
    getTrailEntries(id).then(setTrail).catch((err) => setError(err.message));
  }, [id]);

  // Refetches both blocks and the Space itself: a block change can
  // also change a computed field on the Space (e.g. promoting a line
  // into the Tensions lane changes openTensionCount, which the corner
  // glyph below reads), so both need to stay in sync together. A
  // promotion also writes a Trail entry, so refresh that too.
  const refetchAll = useCallback(() => {
    getSpace(id).then(setSpace).catch((err) => setError(err.message));
    getBlocksForSpace(id).then(setBlocks).catch((err) => setError(err.message));
    getWorkspacesForSpace(id).then(setWorkspaces).catch((err) => setError(err.message));
    // For the per-entry "Move to..." picker. Failing quietly is fine:
    // the picker simply doesn't render, and nothing else here needs it.
    getSpaces().then(setAllSpaces).catch(() => setAllSpaces([]));
    refetchTrail();
  }, [id, refetchTrail]);

  useEffect(() => {
    refetchAll();
    getBacklinksForSpace(id).then(setBacklinks).catch((err) => setError(err.message));
  }, [id, refetchAll]);

  // Navigating from one Space straight to another (e.g. clicking a
  // Reference) reuses this same component instance rather than
  // remounting it, so the "already initialized" guard has to reset per
  // Space id, not just once ever -- otherwise every Space after the
  // first one visited in a session would inherit whichever open/closed
  // state happened to be set for that first one.
  useEffect(() => {
    detailsInitialized.current = false;
    organizeInitialized.current = false;
    trailInitialized.current = false;
    lastFlashedId.current = null;
    // oxlint's react(set-state-in-effect) flags these setState calls, but
    // this is the standard "reset local state when a key prop changes"
    // pattern, not an unnecessary cascading render -- both already get
    // the right value on first mount via their own useState()
    // initializers above; this effect exists only to reset them when the
    // *same* component instance is reused for a different Space id (see
    // the comment above), which an initializer can't do.
    setFlashId(highlightBlockId);
    setHighlightActive(Boolean(highlightBlockId));
  }, [id, highlightBlockId]);

  useEffect(() => {
    if (space && !detailsInitialized.current) {
      detailsInitialized.current = true;
      setDetailsOpen(spaceHasMetadata(space));
    }
  }, [space]);

  useEffect(() => {
    if (workspaces && !organizeInitialized.current) {
      organizeInitialized.current = true;
      setOrganizeOpen(spaceHasOrganization(workspaces));
    }
  }, [workspaces]);

  useEffect(() => {
    if (trail && !trailInitialized.current) {
      trailInitialized.current = true;
      setTrailOpen(spaceHasHistory(trail));
    }
  }, [trail]);

  // The Think section (where blocks render) is never collapsed, so the
  // flashed entry is always in the DOM the moment blocks arrive -- no
  // need to also force any <details> open first. The URL param (when
  // this was seeded from one) is left in place, so the link stays
  // shareable/reloadable; only the one-shot flash clears itself after a
  // few seconds. Guards on the *target element actually existing* (not
  // just `blocks` being loaded) -- a just-created block's id is set via
  // flashBlock before the refetch that will actually render it lands, so
  // this effect harmlessly no-ops on the first re-run and catches it on
  // the one where the new row is really in the DOM.
  //
  // oxlint's set-state-in-effect warning fires on setHighlightActive(true)
  // below -- deliberately accepted, same treatment already given to
  // GraphView.jsx's ref-during-render warnings: this effect is
  // synchronizing with a real external system (the DOM element found via
  // getElementById/scrollIntoView), not deriving state that belongs in
  // render.
  useEffect(() => {
    if (!flashId || !blocks || lastFlashedId.current === flashId) return;
    const el = document.getElementById(`block-${flashId}`);
    if (!el) return;
    lastFlashedId.current = flashId;
    setHighlightActive(true);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightActive(false), 2500);
    // Undoes exactly what setup did, so StrictMode's dev-only
    // setup->cleanup->setup double-invoke behaves like a single real
    // run instead of leaving lastFlashedId stuck set with no timer left
    // to ever clear the flash.
    return () => {
      clearTimeout(timer);
      lastFlashedId.current = null;
    };
  }, [flashId, blocks]);

  // Adding/removing/reordering blocks on a live Space -- the same
  // ordinary edit whether the Space was created a minute ago or a year
  // ago, not a separate "mode". All three just refetch afterward, same
  // as any other block edit on this page (see refetchAll above): every
  // Dashboard-facing computed field (relationDensity, openTensionCount,
  // the Skeleton strip, backlinks, Views) is read fresh from current
  // block state on every fetch, so nothing else needs to change here.
  async function handleAddBlock(spec) {
    const block = await addBlockToSpace(id, spec);
    refetchAll();
    if (block) flashBlock(block.id);
  }

  // A dedicated one-click alternative to the generic "+ Add Entry" ->
  // pick Session -> Start two-step flow, since starting a timer is a
  // more time-sensitive action than adding an ordinary entry -- see
  // sessionActions.js for the shape this creates.
  async function handleStartSession() {
    const block = await addBlockToSpace(id, newSessionSpec());
    refetchAll();
    if (block) flashBlock(block.id);
  }

  async function handleRemoveBlock(blockId) {
    if (!(await confirmDialog('Remove this entry? This cannot be undone.'))) return;
    await deleteBlockApi(blockId);
    refetchAll();
  }

  async function handleReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const order = blocks.map((block) => block.id);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    await reorderBlocksInSpace(id, order);
    refetchAll();
  }

  // The one thing that could be created but never removed. Asks for
  // the title back in the confirm, since this takes every block and
  // the whole Trail with it -- a heavier action than any other delete
  // on this page, so it gets a heavier confirmation to match.
  async function handleDeleteSpace() {
    const confirmed = await promptToMatch(
      `Delete "${space.title}" and everything in it? This cannot be undone.`,
      space.title
    );
    if (!confirmed) return;
    await deleteSpace(id);
    navigate('/');
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      <BackLink />

      {error && <p>Could not load Space: {error}</p>}
      {!error && !space && <p>Loading...</p>}

      {space && (
        <>
          <div className="space-header" {...themeAttributes(resolveSpaceTheme(space))}>
            <h1>
              <SpaceGlyph space={space} size={36} />
              <EditableTitle space={space} onChanged={refetchAll} />
              {space.isTestSpace && <span className="test-flag">TEST SPACE</span>}
            </h1>
            <p className="space-meta">
              <StatusPill space={space} onChanged={refetchAll} />
              <OriginBadge space={space} />
            </p>
            <PageActions>
              <ReportButton fetchReport={() => getSpaceReport(space.id)} label="Space Report" tier="page" />
              {/* Starting a Session used to sit loose in a bare <p> after
                  the Add-Entry form, which is what made it feel like it
                  was in a random spot -- it's one of this page's own
                  actions, so it belongs here with the others. */}
              <button
                type="button"
                className="btn"
                onClick={handleStartSession}
                title="Create and immediately start a new Session, skipping the Add-Entry form"
              >
                ▶ Start a Session
              </button>
            </PageActions>

            {/* Everything below is a property of the Space itself
                (identity/metadata), grouped into one bordered panel so
                it reads as a considered section -- the same treatment
                Workspaces/view-cards/digests already get elsewhere --
                rather than six bare one-line rows stacked directly
                under the title. A native <details>, same as a
                Dashboard digest, so a quick scratch Space (nothing set
                yet) starts collapsed instead of carrying the same
                visual weight as one that's actually accumulated
                metadata -- see spaceHasMetadata/detailsOpen above. */}
            <details
              className="space-collapsible-panel space-details-panel"
              open={detailsOpen}
              onToggle={(event) => setDetailsOpen(event.target.open)}
            >
              <summary>Details</summary>
              {/* Only the fields that hold something, plus one quiet row
                  for adding the rest. The panel opens as soon as *one*
                  of these is set, and used to then show all four -- three
                  of them empty rows with a label and nothing beside it. */}
              {(space.theme || revealed.has('theme')) && <SpaceThemePicker space={space} onChanged={refetchAll} />}
              {(space.due_date || revealed.has('due')) && <DueDate space={space} onChanged={refetchAll} />}
              {(space.tags.length > 0 || revealed.has('tags')) && <TagEditor space={space} onChanged={refetchAll} />}
              <PromoteToResource space={space} onChanged={refetchAll} />
              {(space.categories.length > 0 || revealed.has('categories')) && (
                <CategoryManager space={space} onChanged={refetchAll} />
              )}
              <AddDetail space={space} revealed={revealed} onReveal={(key) => setRevealed(new Set([...revealed, key]))} />
            </details>

            {backlinks && backlinks.length > 0 && (
              <p className="space-meta">
                Referenced by:{' '}
                {backlinks.map((backlink, index) => (
                  <span key={backlink.blockId}>
                    {index > 0 && ', '}
                    <Link to={`/spaces/${backlink.sourceSpaceId}`}>{backlink.sourceSpaceTitle}</Link>
                    {backlink.note && <> ({backlink.note})</>}
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* Workspaces: the assembled environments inside this Space.
              Adaptive density -- a Space that has never created a
              Workspace starts collapsed rather than showing a full,
              empty boxed section. */}
          {workspaces && (
            <details
              className="space-collapsible-panel space-organize-panel"
              open={organizeOpen}
              onToggle={(event) => setOrganizeOpen(event.target.open)}
            >
              <summary>Workspaces</summary>
              <WorkspaceList space={space} workspaces={workspaces} onChanged={refetchAll} />
            </details>
          )}

          {/* Think: the Space's actual working content -- Skeleton
              completeness, the Category/Type filters, the block feed
              itself, and the "+ Add Entry" form. Deliberately a plain
              label, not a collapsible panel like Organize/Trail --
              hiding this by default would hide the reason the page
              exists. See the coherence-audit Roadmap entry. */}
          <h2 className="space-section-label">Think</h2>

          {blocks && <SkeletonCompletenessStrip blocks={blocks} />}

          {/* Filtering by Category is the "zoom in on one aspect of the
              topic" the flat feed couldn't offer -- but it only narrows
              which blocks are shown, never which categories a block
              actually carries, so switching back to "All" always shows
              the same honest multi-category overlap. Only appears once
              the Space has defined at least one Category. */}
          {/* Only once a Category is actually on an entry: a strip of
              tabs all reading (0) filters to nothing at all. */}
          {blocks && space.categories.some((c) => blocks.some((b) => (b.properties?.categories || []).includes(c))) && (
            <p className="category-filter-strip">
              <span
                className={`category-filter-tab${activeCategory === null ? ' category-filter-tab-active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >
                All ({blocks.length})
              </span>
              {space.categories.map((category) => (
                <span
                  key={category}
                  className={`category-filter-tab${
                    activeCategory === category ? ' category-filter-tab-active' : ''
                  }`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category} ({blocks.filter((block) => (block.properties?.categories || []).includes(category)).length})
                </span>
              ))}
            </p>
          )}

          {/* A type filter strip, independent of Categories -- only
              shows once the Space actually has more than one distinct
              Block type on it (filtering a single-type Space would be
              pointless). Unlike Categories, every block always has
              exactly one type, so this only ever narrows, it never
              needs a "some blocks lack this facet" case. */}
          {/* Only once some type holds more than one entry. With four
              entries of four types every tab reads (1), which sorts
              nothing you couldn't already see. */}
          {blocks && [...new Set(blocks.map((b) => b.type))].some(
            (t) => blocks.filter((b) => b.type === t).length > 1
          ) && (
            <p className="category-filter-strip">
              <span
                className={`category-filter-tab${activeType === null ? ' category-filter-tab-active' : ''}`}
                onClick={() => setActiveType(null)}
              >
                All types ({blocks.length})
              </span>
              {[...new Set(blocks.map((block) => block.type))].map((type) => (
                <span
                  key={type}
                  className={`category-filter-tab${activeType === type ? ' category-filter-tab-active' : ''}`}
                  onClick={() => setActiveType(activeType === type ? null : type)}
                >
                  {blockRegistry[type]?.label || type} ({blocks.filter((block) => block.type === type).length})
                </span>
              ))}
            </p>
          )}

          {blocks && blocks.length === 0 && <p>No entries yet.</p>}
          {blocks && blocks.length > 0 && (() => {
            const visibleBlocks = blocks.filter((block) => {
              const matchesCategory =
                activeCategory === null || (block.properties?.categories || []).includes(activeCategory);
              const matchesType = activeType === null || block.type === activeType;
              return matchesCategory && matchesType;
            });
            if (visibleBlocks.length === 0) {
              return (
                <p>
                  No entries match the current filter
                  {activeCategory !== null && <> (&ldquo;{activeCategory}&rdquo;)</>}
                  {activeType !== null && <> ({blockRegistry[activeType]?.label || activeType})</>}.
                </p>
              );
            }
            // Dragging only makes sense against the whole feed: in a
            // filtered view the entries between two rows are hidden, so
            // "drop it here" would mean something the screen isn't showing.
            const reorderable = activeCategory === null && activeType === null && visibleBlocks.length > 1;
            return (
              <div className="block-feed">
                {visibleBlocks.map((block) => {
                  const index = blocks.indexOf(block);
                  const entry = blockRegistry[block.type];
                  const applicableViews = Object.entries(viewRegistry).filter(([, view]) =>
                    view.appliesTo(block)
                  );
                  return (
                    // Keying on updated_at forces a remount when a block's
                    // data changes underneath it (e.g. a Skeleton lane
                    // gaining an item via a different block's shorthand
                    // promotion) -- otherwise this component's own local
                    // edit state, set once at mount, would never notice.
                    // Dragged to reorder, the same native HTML5 pattern a
                    // List's own items already use -- Move up / Move down
                    // buttons on every entry cost two of six controls
                    // forever for something you do rarely. Only enabled
                    // in the unfiltered feed: dragging within a filtered
                    // view would reorder against positions you can't see.
                    <div
                      key={`${block.id}-${block.updated_at}`}
                      id={`block-${block.id}`}
                      className={`block-row${dragOverIndex === index && draggedIndex !== index ? ' drag-over' : ''}`}
                      draggable={reorderable}
                      onDragStart={() => setDraggedIndex(index)}
                      onDragOver={(event) => {
                        if (draggedIndex === null) return;
                        event.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDrop={() => {
                        if (draggedIndex !== null) handleReorder(draggedIndex, index);
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
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
                      {entry ? (
                        <entry.component block={block} onBlocksChanged={refetchAll} />
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
                      <BlockCategoryPicker
                        block={block}
                        spaceCategories={space.categories}
                        onChanged={refetchAll}
                      />
                      <BlockWorkspacePicker
                        block={block}
                        spaceWorkspaces={workspaces || []}
                        onChanged={refetchAll}
                      />
                      <EntryMenu>
                        <ReportButton fetchReport={() => getBlockReport(block.id)} />
                        <ThemePicker
                          item={block}
                          kind="block"
                          onSave={async (theme) => {
                            await updateBlockTheme(block.id, theme);
                            refetchAll();
                          }}
                        />
                        <BlockSpaceMover
                          block={block}
                          spaces={allSpaces}
                          currentSpaceId={space.id}
                          onMoved={refetchAll}
                        />
                        <button
                          type="button"
                          className="btn-ghost-small"
                          onClick={() => handleRemoveBlock(block.id)}
                        >
                          Remove entry
                        </button>
                      </EntryMenu>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {blocks && (
            <>
              <NewBlockForm onAdd={handleAddBlock} categories={space.categories} spaceId={space.id} />
            </>
          )}

          {/* Trail: same adaptive-density treatment as Organize above --
              a brand-new Space with no history yet starts collapsed
              instead of opening onto an empty list. See
              spaceHasHistory/trailOpen above. */}
          {trail && (
            <details
              className="space-collapsible-panel space-trail-panel"
              open={trailOpen}
              onToggle={(event) => setTrailOpen(event.target.open)}
            >
              <summary>Trail</summary>
              <p className="trail-intro">
                This Space's own narrative, in order — for the complete record across every
                Space, see the Log; for trends, see Insights.
              </p>
              <TrailSpine spaceId={id} entries={trail} onEntryAdded={refetchTrail} />
            </details>
          )}

          {/* Neither the Test Space nor the Inbox can be deleted -- the
              backend refuses both, so neither is offered here. Deleting
              the Inbox would take the capture destination with it, not
              just a Space. */}
          {!space.isTestSpace && !space.isInbox && (
            <p className="danger-zone">
              <button type="button" className="btn-danger" onClick={handleDeleteSpace}>
                Delete this Space
              </button>
            </p>
          )}
        </>
      )}
      </main>
    </div>
  );
}

export default SpacePage;
