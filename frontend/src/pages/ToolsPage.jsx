// The Tools catalog: one page to browse every Tool the app has --
// every Block type and every View type -- with its description and a
// live demo. This reads directly from blockRegistry/viewRegistry (see
// CLAUDE.md's transparency requirement); nothing on this page is
// separate data that could drift from what's actually registered.
//
// Each demo renders through the exact same component a live Space
// uses, fed a real id-less block (or, for Graph, plain demo props) --
// not a screenshot or a hand-built mockup. An id-less block is
// automatically read-only (every Block component treats a missing
// `id` as "not editable"), so nothing here can accidentally write to
// the database.

import { Link } from 'react-router-dom';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';

const ALL_TOOLS = { ...blockRegistry, ...viewRegistry };

function labelFor(key) {
  return ALL_TOOLS[key]?.label || key;
}

function ToolCard({ entry, kind }) {
  const Demo = entry.component;
  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <h4>{entry.label}</h4>
        <span className="tool-kind-tag">{kind}</span>
      </div>
      <p className="tool-description">{entry.description}</p>
      {entry.worksWith && entry.worksWith.length > 0 && (
        <p className="tool-works-with">Works with: {entry.worksWith.map(labelFor).join(', ')}</p>
      )}
      <div className="tool-demo">
        {entry.demoProps ? (
          <Demo {...entry.demoProps} />
        ) : entry.demoBlock ? (
          <Demo block={entry.demoBlock} />
        ) : (
          <p className="tool-no-demo">(no demo available)</p>
        )}
      </div>
    </div>
  );
}

function ToolsPage() {
  return (
    <main>
      <Link to="/" className="back-link">
        &larr; Back to Dashboard
      </Link>
      <h1>Tools</h1>
      <p>
        Every Tool a Space can use. Blocks hold content; Views compute a lens over it
        automatically wherever their data fits (that's why a View doesn't get "added" the way a
        Block does). Nothing is created from this page -- it's just what already exists.
      </p>

      <h2>Blocks</h2>
      <p className="tool-family-intro">
        General-purpose Blocks first, then Work -- the ten Tools sharing one underlying shape
        (statement, support, confidence) for a distinct kind of thinking-act -- then Time, for a
        Space's own operational timing rather than its content.
      </p>
      <h3>General</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'general')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Block" />
          ))}
      </div>

      <h3>Work</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'work')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Block" />
          ))}
      </div>

      <h3>Time</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'time')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Block" />
          ))}
      </div>

      <h2>Views</h2>
      <div className="tool-grid">
        {Object.entries(viewRegistry).map(([key, entry]) => (
          <ToolCard key={key} entry={entry} kind="View" />
        ))}
      </div>
    </main>
  );
}

export default ToolsPage;
