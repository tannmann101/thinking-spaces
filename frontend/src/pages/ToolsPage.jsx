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

import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';
import TopNav from '../components/TopNav.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const ALL_TOOLS = { ...blockRegistry, ...viewRegistry };

function labelFor(key) {
  return ALL_TOOLS[key]?.label || key;
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
          <Demo block={entry.demoBlock} />
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
    <main>
      <TopNav current="tools" />
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
        Every Space gets four Skeleton lanes automatically, seeded the moment it's created --{' '}
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
        A line reaches a lane one of two ways. Typing <code>=</code>, <code>?</code>, or{' '}
        <code>!</code> at the start of a line in the Text Workshop <em>promotes</em> it -- the
        line moves out of the Writing Surface into Premises, Open Questions, or Tensions
        respectively (Evidence has no shorthand trigger of its own). A line's own
        &ldquo;File&rdquo; button instead <em>copies</em> it into Premises, Evidence, or Open
        Questions, leaving the original text exactly where it was -- a deliberately different,
        non-destructive path for capturing something without pulling it out of the prose it
        came from.
      </p>
      <p>
        A Tension can name the two actual claims in conflict rather than only describing the
        conflict in prose: pick one statement from any of the three claim-bearing lanes
        (Premises, Evidence, Open Questions), then a second, and the pairing stays live --
        editing either source statement later updates every Tension pairing built from it, with
        no separate sync step. A Work block&rsquo;s own support points can link to these same
        lane items too (see the Work Types above), the same live-resolution idea applied one
        level higher.
      </p>
    </main>
  );
}

export default ToolsPage;
