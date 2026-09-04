// Every Synthesis, and what each was distilled from.
//
// A Synthesis is the one kind of Space this app *produces* rather than
// holds -- scattered Work items compiled into a single piece. So the
// question worth asking of the collection is what fed what, and which
// pieces have settled enough to be promoted to Resource status. The
// lineage has been recorded since the item-level-lineage pass
// (properties.sourceItemIds on each Synthesis's Source Material block);
// until now nothing read it forward, so a Synthesis on the Dashboard
// looked like any other Space.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSynthesesIndex } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import { resolveSpaceTheme, themeAttributes } from '../theme/itemTheme.js';
import PageActions from '../components/PageActions.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function SynthesisCard({ synthesis }) {
  return (
    <li className="synthesis-card" {...themeAttributes(resolveSpaceTheme(synthesis))}>
      <div className="synthesis-card-head">
        <Link to={`/spaces/${synthesis.id}`} className="synthesis-card-title">
          {synthesis.title}
        </Link>
        {synthesis.promoted && (
          <span className="origin-badge-small" title="Settled enough to be referenced like an external Resource">
            ↑ Resource
          </span>
        )}
      </div>

      <p className="synthesis-card-meta">
        {synthesis.kinds.length > 0 ? synthesis.kinds.join(', ') : 'no kind set'}
        {synthesis.drawnFrom.length > 0 &&
          ` · ${synthesis.drawnFrom.length} ${
            synthesis.drawnFrom.length === 1 ? 'claim' : 'claims'
          } from ${synthesis.sourceSpaceCount} ${synthesis.sourceSpaceCount === 1 ? 'Space' : 'Spaces'}`}
      </p>

      {synthesis.drawnFrom.length === 0 ? (
        // Every Synthesis made through the guided flow records what fed
        // it. One with nothing recorded was either written by hand or
        // predates that, which is worth saying rather than leaving blank.
        <p className="empty-note">No recorded sources.</p>
      ) : (
        <>
          <p className="synthesis-card-label">Drawn from</p>
          <ul className="synthesis-lineage">
            {synthesis.drawnFrom.map((item) => (
              <li key={item.blockId}>
                <Link to={`/spaces/${item.spaceId}?highlight=${item.blockId}`}>
                  {blockRegistry[item.type]?.label || item.type}
                </Link>
                {item.statement && <span className="synthesis-lineage-text">{item.statement}</span>}
                <span className="synthesis-lineage-space">in {item.spaceTitle}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function SynthesesPage() {
  usePageTitle('Syntheses');
  const [syntheses, setSyntheses] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSynthesesIndex()
      .then(setSyntheses)
      .catch((err) => setError(err.message));
  }, []);

  const promotedCount = useMemo(
    () => (syntheses || []).filter((synthesis) => synthesis.promoted).length,
    [syntheses]
  );

  return (
    <div className="app-shell">
      <Sidebar current="syntheses" />
      <main className="app-content">
        <h1>Syntheses</h1>
        <p>
          The pieces this app has produced &mdash; scattered claims compiled into something more polished.
          Each shows what it was distilled from, so you can follow a finished piece back to the thinking
          behind it.
        </p>

        <PageActions>
          <Link to="/synthesis/new" className="btn">
            + New Synthesis
          </Link>
        </PageActions>

        {error && <p>Could not load Syntheses: {error}</p>}
        {!error && !syntheses && <p>Loading...</p>}

        {syntheses && syntheses.length === 0 && (
          <p className="empty-note">
            None yet. <Link to="/synthesis/new">Compile one</Link> from Work items across your Spaces.
          </p>
        )}

        {syntheses && syntheses.length > 0 && (
          <>
            <p className="resource-summary">
              {syntheses.length} {syntheses.length === 1 ? 'Synthesis' : 'Syntheses'}
              {promotedCount > 0 && ` · ${promotedCount} promoted to Resource`}
            </p>
            <ul className="synthesis-grid">
              {syntheses.map((synthesis) => (
                <SynthesisCard key={synthesis.id} synthesis={synthesis} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default SynthesesPage;
