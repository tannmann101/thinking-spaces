// THE Block registry. Per CLAUDE.md: "Every Tool ... must be
// registered in one single, readable file ... The point is that the
// person can open one file and see the complete list of what exists."
//
// This is that file. To see every Block type the app supports, look
// here -- not in components, not in the backend, just here. Adding a
// new Block type means adding one entry to `blockRegistry` below.
//
// Two fields exist purely for the Tools catalog page (ToolsPage.jsx):
// `worksWith` names other Tools (by registry key, Block or View) this
// one is meant to be used alongside, and `demoBlock` is a real, id-less
// block object the catalog renders through the same `component` every
// live Space uses -- not a separate mockup. An id-less block naturally
// renders read-only (every Block component treats a missing `id` as
// "not editable"), so the demo is inert without any special-casing.
//
// `workshopComponent` is optional: when present, a Workspace page (see
// WorkspacePage.jsx) renders this instead of the ordinary `component`
// for that Tool -- a bespoke, more spacious environment tailored to
// that specific Tool, per the Workspaces feature. Most Tools don't have
// one yet (each gets its own redesign pass, one at a time, per
// CLAUDE.md's Open section) and just fall back to `component`.
//
// `family` is 'general' (Text, List, Reference, Media, Comparison --
// the original five, no external input needed to add most of them),
// 'work' (Assessment and everything built on the same shared
// skeleton), or 'time' (Milestone, and anything else about a Space's
// own operational timing -- due dates, checkpoints, sessions -- rather
// than its content). It exists so any UI that lists Tools --
// ToolsPage.jsx's catalog, NewBlockForm.jsx's "+ Add Block" dropdown --
// can group by family instead of rendering one flat, registry-order
// list. Added once the app had grown to 15 Block types and both of
// those screens had become hard to scan; adding a new Work (or Time)
// Type only ever needs its `family` set here, nothing else touches
// those UIs.
//
// `icon` is a single restrained text glyph (no emoji) giving each Tool
// its own small visual identity -- a real gap found by auditing the
// Tools catalog and a live Space: every Block type rendered as an
// identical box, and a Work block's own kind (e.g. "Assessment" vs
// "Question") was never actually shown anywhere, only used as
// placeholder-text hinting. `family` still carries the coarse grouping
// (a colored left border on a block row/tool card, via `data-family`);
// `icon` adds the finer, per-type distinction on top of it. Both are
// read centrally -- ToolsPage.jsx's ToolCard, and the block-feed row
// wrapper in SpacePage.jsx/WorkspacePage.jsx -- rather than duplicated
// into every individual Block component.

import TextBlock from '../blocks/TextBlock.jsx';
import TextWorkshop from '../blocks/TextWorkshop.jsx';
import ListBlock from '../blocks/ListBlock.jsx';
import ListWorkshop from '../blocks/ListWorkshop.jsx';
import ReferenceBlock from '../blocks/ReferenceBlock.jsx';
import ReferenceWorkshop from '../blocks/ReferenceWorkshop.jsx';
import MediaBlock from '../blocks/MediaBlock.jsx';
import MediaWorkshop from '../blocks/MediaWorkshop.jsx';
import ComparisonBlock from '../blocks/ComparisonBlock.jsx';
import WorkBlock from '../blocks/WorkBlock.jsx';
import { WORK_LABELS } from '../blocks/workLabels.js';
import ComparisonWorkshop from '../blocks/ComparisonWorkshop.jsx';
import MilestoneBlock from '../blocks/MilestoneBlock.jsx';
import SessionBlock from '../blocks/SessionBlock.jsx';
import WordEvolutionBlock from '../blocks/WordEvolutionBlock.jsx';
import ConceptMapBlock from '../blocks/ConceptMapBlock.jsx';
import ModelBlock from '../blocks/ModelBlock.jsx';

// Mirrors TEST_SPACE_ID in worker/src/db/constants.js -- the frontend
// and backend are separate bundles, so this can't be a shared import,
// only a matching literal (same reasoning as SKELETON_LANE_LABELS in
// skeleton.js mirroring the backend's SKELETON_LANES).
const TEST_SPACE_ID = 'test-space';

// The only inline attribution tags a Text block's content.tag can hold.
// Exported so any future UI for creating/editing Text blocks reads
// this list instead of redefining it.
export const TEXT_ATTRIBUTION_TAGS = ['quote', 'paraphrase', 'reflection', 'inference'];

// The only values a List item's or Work item's confidence property can
// hold, ordered least- to most-confident. Widened from an original
// 3-level scale (solid/tentative/questioned) to this 5-level one for
// more "surgical" precision -- the original three words are kept as-is
// (so no existing stored value needed migrating), with `moderate` and
// `certain` added to round the scale out.
export const CONFIDENCE_LEVELS = ['questioned', 'tentative', 'moderate', 'solid', 'certain'];

// The only kinds a Media block's content.mediaType can hold. 'image',
// 'link', and 'document' render real content; 'audio' and 'sketch' are
// still stubs -- see MediaBlock.jsx.
export const MEDIA_TYPES = ['image', 'link', 'document', 'audio', 'sketch'];

// A self-contained SVG data URI so the Media demo renders with no
// dependency on external network access. Colored to match
// the app's own dark palette/type system directly (rather than
// inheriting index.css's variables, which an SVG data URI can't do)
// so the demo doesn't read as an unstyled placeholder dropped into an
// otherwise fully art-directed catalog.
const DEMO_IMAGE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>" +
  "<rect width='100%' height='100%' fill='#201a1b'/>" +
  "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#6f5c5e' font-family='monospace' font-size='14'>Demo image</text>" +
  '</svg>';
const DEMO_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(DEMO_IMAGE_SVG)}`;

export const blockRegistry = {
  text: {
    label: 'Writing',
    description:
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.',
    family: 'general',
    icon: '¶',
    component: TextBlock,
    workshopComponent: TextWorkshop,
    worksWith: ['comparison'],
    demoBlock: {
      type: 'text',
      content: { tag: 'reflection', text: 'A demo paragraph, showing how a Writing entry reads.' },
      properties: {},
    },
  },
  list: {
    label: 'List',
    description:
      'An ordered set of items. Each item can optionally carry a checkbox, a number, a date, or a confidence marker.',
    family: 'general',
    icon: '☰',
    component: ListBlock,
    workshopComponent: ListWorkshop,
    worksWith: ['timeline', 'progress', 'streak', 'ledger'],
    demoBlock: {
      type: 'list',
      content: {
        laneLabel: 'Demo list',
        items: [
          { id: 'demo-1', text: 'Read the primary source', checkbox: true },
          { id: 'demo-2', text: 'Draft an outline', checkbox: false },
        ],
      },
      properties: {},
    },
  },
  reference: {
    label: 'Reference',
    description: 'A link to another Space, with an optional note.',
    family: 'general',
    icon: '→',
    component: ReferenceBlock,
    workshopComponent: ReferenceWorkshop,
    worksWith: ['comparison', 'graph'],
    // Points at the real Test Space so clicking the demo is harmless
    // (and even a little useful) rather than a dead link.
    demoBlock: {
      type: 'reference',
      content: {
        target_space_id: TEST_SPACE_ID,
        targetSpaceTitle: 'Test Space',
        note: 'why this connects',
      },
      properties: {},
    },
  },
  media: {
    label: 'Media',
    description:
      'An image, a link preview, an uploaded file, an audio clip, or an embedded sketch. Images, links, and files render inline; audio and sketch are still placeholders.',
    family: 'general',
    icon: '▣',
    component: MediaBlock,
    workshopComponent: MediaWorkshop,
    worksWith: [],
    demoBlock: {
      type: 'media',
      content: { mediaType: 'image', url: DEMO_IMAGE_URL, caption: 'A demo caption' },
      properties: {},
    },
  },
  comparison: {
    label: 'Comparison',
    description:
      'Two Writing or Reference entries shown side by side, optionally marked as a contrast.',
    family: 'general',
    icon: '⇄',
    component: ComparisonBlock,
    workshopComponent: ComparisonWorkshop,
    worksWith: ['text', 'reference'],
    demoBlock: {
      type: 'comparison',
      content: {
        left: { kind: 'text', tag: null, text: 'Option A' },
        right: { kind: 'text', tag: null, text: 'Option B' },
        contrast: true,
        contrastNote: 'demo contrast',
      },
      properties: {},
    },
  },
  // "Work": the thinking itself -- a claim you are making, with the
  // points that support it and how settled it feels. One Tool, not
  // eleven.
  //
  // It was eleven: Assessment, Question, Analysis, Deduction,
  // Definition, Demonstration, Insight, Implication, Hypothesis,
  // Objection, Formulation -- each a real registered Tool that, in the
  // end, differed from its neighbours only in what it called its two
  // text fields. The cost landed at exactly the wrong moment: you had
  // to decide which kind of thinking this was before you could write
  // the thought down, choosing between "a softer sibling to Deduction"
  // and its siblings from a flat dropdown. A whole "Compare Work
  // Types" panel was built to make that choice survivable, which is
  // the clearest evidence it should not have had to be made.
  //
  // Now: one Claim, and `kind` is an optional free-text label you can
  // set after the fact or never. The retired names live on in
  // blocks/workLabels.js so entries already written as one keep
  // rendering as they always did -- they just aren't offered any more.
  // See worker/src/db/work.js's WORK_TYPES for the query-side list.
  claim: {
    label: 'Claim',
    description: 'Something you are asserting, with the points that support it and how settled it feels.',
    family: 'work',
    icon: '\u25c8',
    component: WorkBlock,
    worksWith: ['text', 'list', 'reference'],
    demoBlock: {
      type: 'claim',
      content: {
        statement: 'This vendor is not worth the switching cost.',
        kind: 'assessment',
        support: [{ id: 'demo-1', text: 'Migration effort outweighs the savings within any reasonable payback window.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  // "Time": the app's operational timing around a Space's own work --
  // due dates, checkpoints, and (later) sessions -- as real Tools of
  // their own rather than more flavors of List item. Milestone is the
  // first: a checkpoint with a target date and its own reached/not-yet
  // -reached state, distinct from a List item's `reviewBy` (which is
  // about "come back and reconsider this," not "this got done").
  milestone: {
    label: 'Milestone',
    description: 'A checkpoint with a target date and a reached/not-yet-reached state.',
    family: 'time',
    icon: '◆',
    component: MilestoneBlock,
    worksWith: ['list', 'assessment'],
    demoBlock: {
      type: 'milestone',
      content: {
        label: 'Ship the first draft',
        targetDate: '2026-09-15',
        reached: false,
        reachedAt: null,
        note: 'Needs the intro section finished first.',
      },
      properties: {},
    },
  },
  // A Session is one timed sitting of work -- start it, stop it, the
  // elapsed time gets logged. Deliberately one Block per sitting
  // (add another Session block for the next one) rather than a running
  // log inside a single block, same granularity Milestone and Work
  // items already use. startedAt/endedAt are the source of truth (not
  // a client-side ticking number): SessionBlock.jsx derives "elapsed
  // so far" from startedAt on every render, so a running session reads
  // correctly even after the tab was closed and reopened.
  session: {
    label: 'Session',
    description: 'A timed sitting of work — start it, stop it, and the elapsed time is logged.',
    family: 'time',
    icon: '◷',
    component: SessionBlock,
    worksWith: ['milestone'],
    demoBlock: {
      type: 'session',
      content: {
        label: 'Drafting the intro',
        startedAt: '2026-08-20T14:00:00.000Z',
        endedAt: '2026-08-20T14:45:00.000Z',
        durationMinutes: 45,
        note: '',
      },
      properties: {},
    },
  },
  // --- Mapping -------------------------------------------------------
  // A fourth family, alongside general/work/time. These three are about
  // structure and relation rather than a single claim, so none of them
  // shares Work's {statement, support, confidence} shape -- which is
  // exactly why they can't be family 'work': NewBlockForm builds its
  // Work optgroup off that family and would create them with the wrong
  // content shape. Each carries its own starter branch there instead.
  wordEvolution: {
    label: 'Word Evolution',
    description: "How a term's sense shifted over time — each stage with when it held, what it meant then, and what moved it.",
    family: 'mapping',
    icon: '⟿',
    component: WordEvolutionBlock,
    worksWith: ['conceptMap', 'reference', 'definition'],
    demoBlock: {
      type: 'wordEvolution',
      content: {
        term: 'virtue',
        senses: [
          {
            id: 'demo-sense-1',
            period: 'Latin (virtus)',
            sense: 'Manliness, valour — the excellence proper to a soldier.',
            note: 'Rooted in vir, "man".',
          },
          {
            id: 'demo-sense-2',
            period: 'Medieval',
            sense: 'Moral excellence, as one of the cardinal or theological virtues.',
            note: 'Absorbed into a Christian moral framework.',
          },
          {
            id: 'demo-sense-3',
            period: 'Modern',
            sense: 'Any admirable quality, often merely conventional goodness.',
            note: 'Weakened — "virtue signalling" now reads as a charge.',
          },
        ],
      },
      properties: {},
    },
  },
  conceptMap: {
    label: 'Concept Map',
    description: 'A referent and every rendering of it in circulation, each marked by how far it actually sits from the thing itself.',
    family: 'mapping',
    icon: '◈',
    component: ConceptMapBlock,
    worksWith: ['wordEvolution', 'definition', 'formulation'],
    demoBlock: {
      type: 'conceptMap',
      content: {
        referent: 'Freedom',
        gloss: 'The condition of being able to act according to what one actually is.',
        renderings: [
          {
            id: 'demo-rendering-1',
            label: 'Freedom (absence of constraint)',
            sense: 'Nobody is stopping me.',
            alignment: 'partial',
            note: 'Catches the negative half, says nothing about what the acting is for.',
          },
          {
            id: 'demo-rendering-2',
            label: 'Freedom (unlimited option)',
            sense: 'I can pick anything at all.',
            alignment: 'divergent',
            note: 'Points at the size of a menu, not at the agent — this is where the argument usually goes wrong.',
          },
        ],
      },
      properties: {},
    },
  },
  model: {
    label: 'Model',
    description: 'The parts something is built from and how they relate — a worldview, a philosophy, or any concept laid out as structure.',
    family: 'mapping',
    icon: '⬡',
    component: ModelBlock,
    worksWith: ['conceptMap', 'formulation', 'analysis'],
    demoBlock: {
      type: 'model',
      content: {
        subject: 'A meritocratic worldview',
        components: [
          { id: 'demo-c1', name: 'Effort', role: 'What the individual contributes' },
          { id: 'demo-c2', name: 'Outcome', role: 'What they end up with' },
          { id: 'demo-c3', name: 'Desert', role: 'The claim that the outcome is deserved' },
        ],
        relations: [
          {
            id: 'demo-r1',
            from: 'demo-c1',
            to: 'demo-c2',
            kind: 'is assumed to produce',
            note: 'The load-bearing assumption — if it fails, desert fails with it.',
          },
          {
            id: 'demo-r2',
            from: 'demo-c2',
            to: 'demo-c3',
            kind: 'is taken to justify',
            note: '',
          },
        ],
      },
      properties: {},
    },
  },
};

// The ten retired Work Types (see blocks/workLabels.js). They are real
// registry entries so an entry already written as one still renders
// exactly as it did -- WorkBlock reads its own two labels from the
// block's type -- and they carry `retired: true` so nothing that lets
// you *choose* a Tool offers them: not the catalog, not the "+ Add
// Entry" picker, not a Template. Generated from one list rather than
// written out ten times, because a retired Type has nothing left to
// say for itself beyond its name.
for (const [type, labels] of Object.entries(WORK_LABELS)) {
  if (type === 'claim') continue;
  blockRegistry[type] = {
    label: labels.statement,
    description: `A retired Work Type. Existing entries still work; new ones are Claims.`,
    family: 'work',
    icon: '\u25c8',
    component: WorkBlock,
    worksWith: [],
    retired: true,
  };
}
