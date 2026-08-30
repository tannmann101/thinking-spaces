import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSpace, getBlocksForSpace } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';

function SpacePage() {
  const { id } = useParams();
  const [space, setSpace] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpace(id).then(setSpace).catch((err) => setError(err.message));
    getBlocksForSpace(id).then(setBlocks).catch((err) => setError(err.message));
  }, [id]);

  return (
    <main>
      <p>
        <Link to="/">&larr; Back to Dashboard</Link>
      </p>

      {error && <p>Could not load Space: {error}</p>}
      {!error && !space && <p>Loading...</p>}

      {space && (
        <>
          <h1>
            {space.title}
            {space.isTestSpace && ' [TEST SPACE]'}
          </h1>
          <p>Status: {space.status}</p>

          {blocks && blocks.length === 0 && <p>No blocks yet.</p>}
          {blocks &&
            blocks.map((block) => {
              const entry = blockRegistry[block.type];
              const applicableViews = Object.entries(viewRegistry).filter(([, view]) =>
                view.appliesTo(block)
              );
              return (
                <div key={block.id}>
                  {entry ? (
                    <entry.component block={block} />
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
