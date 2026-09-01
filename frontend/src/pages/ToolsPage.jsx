// The Tools catalog: one page to browse every Tool the app has --
// every Block type and every View type -- with its description and a
// live demo. This reads directly from blockRegistry/viewRegistry (see
// CLAUDE.md's transparency requirement); nothing on this page is
// separate data that could drift from what's actually registered.
//
// Each demo renders through the exact same component a live Space
// uses, fed a real id-less block (or, for Graph, plain demo props) --
// not a screenshot or a hand-built mockup. A demo is genuinely
// interactive -- checkboxes toggle, text opens for editing, items can
// be added/reordered -- via DemoBlock below, which holds the evolving
// content as its own local state and passes it back in through
// `onSave` rather than ever letting a Block component reach for the
// real API with an id that doesn't exist. That's the exact same
// `onSave` override every Block component already supports for a
// Comparison-embedded side (see ReferenceBlock.jsx's own comment) --
// reused here rather than inventing a second, demo-specific mechanism.
// A View's demo needs none of this: Views are already read-only,
// computed lenses with no edit surface to begin with.

import { useState } from 'react';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const ALL_TOOLS = { ...blockRegistry, ...viewRegistry };

function labelFor(key) {
  return ALL_TOOLS[key]?.label || key;
}

// A demo block's own content, held here rather than in entry.demoBlock
// itself, so typing/clicking in one card's demo never mutates the
// registry's shared demo data (every ToolCard would otherwise be
// rendering, and silently sharing, the exact same object).
function DemoBlock({ entry }) {
  const Demo = entry.component;
  const [content, setContent] = useState(entry.demoBlock.content);
  // Merged onto the previous content, not replaced outright -- a real
  // Reference block's targetSpaceTitle is a display field the backend
  // injects at read time rather than something PATCHed back (see
  // backend/src/db/queries/blocks.js), so a demo with no backend behind
  // it needs to hang onto it itself across an edit instead of losing it.
  return (
    <Demo
      block={{ ...entry.demoBlock, content }}
      onSave={(next) => setContent((prev) => ({ ...prev, ...next }))}
      onBlocksChanged={() => {}}
    />
  );
}

function ToolCard({ entry, kind }) {
  const Demo = entry.component;
  return (
    <div className="tool-card" data-family={entry.family}>
      <div className="tool-card-head">
        {entry.icon && <span className="tool-card-icon">{entry.icon}</span>}
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
          <DemoBlock entry={entry} />
        ) : (
          <p className="tool-no-demo">(no demo available)</p>
        )}
      </div>
    </div>
  );
}

function ToolsPage() {
  usePageTitle('Tools');
  return (
    <div className="app-shell">
      <Sidebar current="tools" />
      <main className="app-content">
      <h1>Tools</h1>
      <p>
        Every Tool a Space can use. Entries hold content; Views compute a lens over it
        automatically wherever their data fits (that's why a View doesn't get "added" the way an
        Entry does). Nothing is created from this page -- it's just what already exists.
      </p>

      <h2>Entries</h2>
      <p className="tool-family-intro">
        General-purpose Entries first, then Work -- the ten Tools sharing one underlying shape
        (statement, support, confidence) for a distinct kind of thinking-act -- then Time, for a
        Space's own operational timing rather than its content.
      </p>
      <h3>General</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'general')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Entry" />
          ))}
      </div>

      <h3>Work</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'work')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Entry" />
          ))}
      </div>

      <h3>Time</h3>
      <div className="tool-grid">
        {Object.entries(blockRegistry)
          .filter(([, entry]) => entry.family === 'time')
          .map(([key, entry]) => (
            <ToolCard key={key} entry={entry} kind="Entry" />
          ))}
      </div>

      <h2>Views</h2>
      <div className="tool-grid">
        {Object.entries(viewRegistry).map(([key, entry]) => (
          <ToolCard key={key} entry={entry} kind="View" />
        ))}
      </div>

      {/* Not a registered Block or View -- the Skeleton is four
          ordinary List blocks and one Text block, identified by a
          marker rather than its own type (see registry/skeleton.js).
          It's still one of the app's most load-bearing capabilities,
          and it previously had no presence at all on the one page
          whose whole job is "browse everything this app can do" --
          someone who hadn't already stumbled into a Workspace to find
          it would have no way to learn it exists. Written as plain
          prose rather than forced into the ToolCard grid above, since
          it genuinely isn't the same kind of thing as an addable
          Block/View Tool. */}
      <h2>Skeleton &amp; Tensions</h2>
      <p>
        Every Space gets four Skeleton sections automatically, seeded the moment it's created --{' '}
        {SKELETON_LANE_LABELS.map((lane, index) => (
          <span key={lane.key}>
            {index > 0 && (index === SKELETON_LANE_LABELS.length - 1 ? ', and ' : ', ')}
            <strong>{lane.label}</strong>
          </span>
        ))}
        . Together they hold the shape of your reasoning about a Space's topic, separate from the
        ordinary prose feed: claims you're building on, support for those claims, and the
        questions or conflicts still open.
      </p>
      <p>
        A line reaches a section one of two ways. Typing <code>=</code>, <code>?</code>, or{' '}
        <code>!</code> at the start of a line in the Writing Workshop <em>promotes</em> it -- the
        line moves out of the Writing Surface into Premises, Open Questions, or Tensions
        respectively (Evidence has no shorthand trigger of its own). A line's own
        &ldquo;File&rdquo; button instead <em>copies</em> it into Premises, Evidence, or Open
        Questions, leaving the original text exactly where it was -- a deliberately different,
        non-destructive path for capturing something without pulling it out of the prose it
        came from.
      </p>
      <p>
        A Tension can name the two actual claims in conflict rather than only describing the
        conflict in prose: pick one statement from any of the three claim-bearing sections
        (Premises, Evidence, Open Questions), then a second, and the pairing stays live --
        editing either source statement later updates every Tension pairing built from it, with
        no separate sync step. A Work entry&rsquo;s own support points can link to these same
        section items too (see the Work Types above), the same live-resolution idea applied one
        level higher.
      </p>
      </main>
    </div>
  );
}

export default ToolsPage;
