import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  getSpace,
  getBlocksForSpace,
  getBacklinksForSpace,
  getTrailEntries,
  addBlockToSpace,
  deleteBlockApi,
  moveBlockInSpace,
} from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import SpaceGlyph from '../glyph/SpaceGlyph.jsx';
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

function SpacePage() {
  const { id } = useParams();
  const [space, setSpace] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [backlinks, setBacklinks] = useState(null);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState(null);

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
              {space.title}
              {space.isTestSpace && <span className="test-flag">TEST SPACE</span>}
            </h1>
            <p className="space-meta">
              <span className="status-pill" data-status={space.status}>
                {space.status}
              </span>
            </p>

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

          {blocks && blocks.length === 0 && <p>No blocks yet.</p>}
          {blocks && blocks.length > 0 && (
            <div className="block-feed">
              {blocks.map((block, index) => {
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
          )}

          {blocks && <NewBlockForm onAdd={handleAddBlock} />}

          {trail && <TrailSpine spaceId={id} entries={trail} onEntryAdded={refetchTrail} />}
        </>
      )}
    </main>
  );
}

export default SpacePage;
