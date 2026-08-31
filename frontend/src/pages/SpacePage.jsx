import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  getSpace,
  getBlocksForSpace,
  getBacklinksForSpace,
  getTrailEntries,
  addBlockToSpace,
  deleteBlockApi,
  moveBlockInSpace,
  updateSpace,
  updateBlockCategories,
  deleteSpace,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import SpaceGlyph, { SPACE_STATUSES } from '../glyph/SpaceGlyph.jsx';
import TrailSpine from '../trail/TrailSpine.jsx';
import NewBlockForm from '../blocks/NewBlockForm.jsx';

function BackLink() {
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const [fromSpace, setFromSpace] = useState(null);

  useEffect(() => {
    if (fromId) getSpace(fromId).then(setFromSpace).catch(() => setFromSpace(null));
  }, [fromId]);

  if (fromId) {
    return (
      <Link to={`/spaces/${fromId}`} className="back-link">
        &larr; Back to {fromSpace ? fromSpace.title : '...'}
      </Link>
    );
  }
  return (
    <Link to="/" className="back-link">
      &larr; Back to Dashboard
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
        style={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', flex: 1 }}
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
      title="Click to cycle: nascent -> developing -> mature -> dormant"
    >
      {space.status}
    </span>
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
          <span className="editable-toggle" onClick={() => removeTag(tag)} title="Remove tag">
            ✕
          </span>
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
          <span
            className="editable-toggle"
            onClick={() => removeCategory(category)}
            title="Remove category"
          >
            ✕
          </span>
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

// "What this Space is working towards" -- a property of the Space
// itself (like status), not a block. It sits above the content rather
// than inside it, which is exactly what makes it different from
// anything a Space can contain.
function WorkingToward({ space, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(space.goal || '');

  async function finish() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (space.goal || '')) return;
    await updateSpace(space.id, { goal: trimmed || null });
    onChanged();
  }

  if (editing) {
    return (
      <p className="working-toward">
        Working toward:{' '}
        <input
          type="text"
          value={draft}
          autoFocus
          style={{ width: '60%' }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => event.key === 'Enter' && finish()}
        />
      </p>
    );
  }
  return (
    <p className="working-toward">
      Working toward:{' '}
      <span
        className="editable"
        onClick={() => {
          setDraft(space.goal || '');
          setEditing(true);
        }}
      >
        {space.goal || '(not set -- click to add)'}
      </span>
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

function SpacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [space, setSpace] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [backlinks, setBacklinks] = useState(null);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState(null);
  // null = show every block; a category name = focus on just that facet.
  // This is view-only state (not persisted) -- "zoom in on one aspect of
  // the topic" without hiding the multi-category chips on each block, so
  // switching back to "All" always shows the full, honest overlap again.
  const [activeCategory, setActiveCategory] = useState(null);

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
    refetchTrail();
  }, [id, refetchTrail]);

  useEffect(() => {
    refetchAll();
    getBacklinksForSpace(id).then(setBacklinks).catch((err) => setError(err.message));
  }, [id, refetchAll]);

  // Adding/removing/reordering blocks on a live Space -- the same
  // ordinary edit whether the Space was created a minute ago or a year
  // ago, not a separate "mode". All three just refetch afterward, same
  // as any other block edit on this page (see refetchAll above): every
  // Dashboard-facing computed field (relationDensity, openTensionCount,
  // the Skeleton strip, backlinks, Views) is read fresh from current
  // block state on every fetch, so nothing else needs to change here.
  async function handleAddBlock(spec) {
    await addBlockToSpace(id, spec);
    refetchAll();
  }

  async function handleRemoveBlock(blockId) {
    if (!window.confirm('Remove this block? This cannot be undone.')) return;
    await deleteBlockApi(blockId);
    refetchAll();
  }

  async function handleMoveBlock(blockId, direction) {
    await moveBlockInSpace(id, blockId, direction);
    refetchAll();
  }

  // The one thing that could be created but never removed. Asks for
  // the title back in the confirm, since this takes every block and
  // the whole Trail with it -- a heavier action than any other delete
  // on this page, so it gets a heavier confirmation to match.
  async function handleDeleteSpace() {
    const typed = window.prompt(
      `Delete "${space.title}" and everything in it? This cannot be undone.\n\nType the Space's name to confirm:`
    );
    if (typed !== space.title) return;
    await deleteSpace(id);
    navigate('/');
  }

  return (
    <main>
      <BackLink />

      {error && <p>Could not load Space: {error}</p>}
      {!error && !space && <p>Loading...</p>}

      {space && (
        <>
          <div className="space-header">
            <h1>
              <SpaceGlyph space={space} size={36} />
              <EditableTitle space={space} onChanged={refetchAll} />
              {space.isTestSpace && <span className="test-flag">TEST SPACE</span>}
            </h1>
            <p className="space-meta">
              <StatusPill space={space} onChanged={refetchAll} />
            </p>

            <WorkingToward space={space} onChanged={refetchAll} />
            <TagEditor space={space} onChanged={refetchAll} />
            <CategoryManager space={space} onChanged={refetchAll} />

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

            {blocks && <SkeletonCompletenessStrip blocks={blocks} />}
          </div>

          {/* Filtering by Category is the "zoom in on one aspect of the
              topic" the flat feed couldn't offer -- but it only narrows
              which blocks are shown, never which categories a block
              actually carries, so switching back to "All" always shows
              the same honest multi-category overlap. Only appears once
              the Space has defined at least one Category. */}
          {blocks && space.categories.length > 0 && (
            <p className="category-filter-strip">
              <span
                className={`category-filter-tab${activeCategory === null ? ' category-filter-tab-active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >
                All
              </span>
              {space.categories.map((category) => (
                <span
                  key={category}
                  className={`category-filter-tab${
                    activeCategory === category ? ' category-filter-tab-active' : ''
                  }`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </span>
              ))}
            </p>
          )}

          {blocks && blocks.length === 0 && <p>No blocks yet.</p>}
          {blocks && blocks.length > 0 && (() => {
            const visibleBlocks =
              activeCategory === null
                ? blocks
                : blocks.filter((block) => (block.properties?.categories || []).includes(activeCategory));
            if (visibleBlocks.length === 0) {
              return <p>No blocks filed under &ldquo;{activeCategory}&rdquo; yet.</p>;
            }
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
                    <div key={`${block.id}-${block.updated_at}`} className="block-row">
                      {entry ? (
                        <entry.component block={block} onBlocksChanged={refetchAll} />
                      ) : (
                        <p>Unknown block type: {block.type}</p>
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
                      <div className="block-controls">
                        <button
                          type="button"
                          className="btn-ghost-small"
                          onClick={() => handleMoveBlock(block.id, -1)}
                          disabled={index === 0}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn-ghost-small"
                          onClick={() => handleMoveBlock(block.id, 1)}
                          disabled={index === blocks.length - 1}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          className="btn-ghost-small"
                          onClick={() => handleRemoveBlock(block.id)}
                        >
                          Remove block
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {blocks && <NewBlockForm onAdd={handleAddBlock} categories={space.categories} />}

          {trail && <TrailSpine spaceId={id} entries={trail} onEntryAdded={refetchTrail} />}

          {!space.isTestSpace && (
            <p className="danger-zone">
              <button type="button" className="btn-danger" onClick={handleDeleteSpace}>
                Delete this Space
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}

export default SpacePage;
