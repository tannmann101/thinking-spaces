import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getSpace, getBlocksForSpace, getBacklinksForSpace } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import SpaceGlyph from '../glyph/SpaceGlyph.jsx';

function BackLink() {
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const [fromSpace, setFromSpace] = useState(null);

  useEffect(() => {
    if (fromId) getSpace(fromId).then(setFromSpace).catch(() => setFromSpace(null));
  }, [fromId]);

  if (fromId) {
    return (
      <p>
        <Link to={`/spaces/${fromId}`}>&larr; Back to {fromSpace ? fromSpace.title : '...'}</Link>
      </p>
    );
  }
  return (
    <p>
      <Link to="/">&larr; Back to Dashboard</Link>
    </p>
  );
}

// "An honest picture of where the thinking currently stands" -- not a
// score, just which of the four Skeleton lanes have anything in them.
// Only renders once at least one lane block exists for this Space.
function SkeletonCompletenessStrip({ blocks }) {
  const lanes = blocks.filter((block) => block.type === 'list' && block.properties?.skeletonLane);
  if (lanes.length === 0) return null;

  const filledByLane = new Map(
    lanes.map((block) => [block.properties.skeletonLane, (block.content.items || []).length > 0])
  );

  return (
    <p>
      Skeleton:{' '}
      {SKELETON_LANE_LABELS.map(({ key, label }, index) => (
        <span key={key}>
          {index > 0 && ' · '}
          {label} {filledByLane.get(key) ? '●' : '○'}
        </span>
      ))}
    </p>
  );
}

function SpacePage() {
  const { id } = useParams();
  const [space, setSpace] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [backlinks, setBacklinks] = useState(null);
  const [error, setError] = useState(null);

  // Refetches both blocks and the Space itself: a block change can
  // also change a computed field on the Space (e.g. promoting a line
  // into the Tensions lane changes openTensionCount, which the corner
  // glyph below reads), so both need to stay in sync together.
  const refetchAll = useCallback(() => {
    getSpace(id).then(setSpace).catch((err) => setError(err.message));
    getBlocksForSpace(id).then(setBlocks).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    refetchAll();
    getBacklinksForSpace(id).then(setBacklinks).catch((err) => setError(err.message));
  }, [id, refetchAll]);

  return (
    <main>
      <BackLink />

      {error && <p>Could not load Space: {error}</p>}
      {!error && !space && <p>Loading...</p>}

      {space && (
        <>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SpaceGlyph space={space} size={36} />
            {space.title}
            {space.isTestSpace && ' [TEST SPACE]'}
          </h1>
          <p>Status: {space.status}</p>

          {backlinks && backlinks.length > 0 && (
            <p>
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

          {blocks && blocks.length === 0 && <p>No blocks yet.</p>}
          {blocks &&
            blocks.map((block) => {
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
                <div key={`${block.id}-${block.updated_at}`}>
                  {entry ? (
                    <entry.component block={block} onBlocksChanged={refetchAll} />
                  ) : (
                    <p>Unknown block type: {block.type}</p>
                  )}
                  {applicableViews.map(([key, view]) => (
                    <view.component key={key} block={block} />
                  ))}
                </div>
              );
            })}
        </>
      )}
    </main>
  );
}

export default SpacePage;
