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

import TextBlock from '../blocks/TextBlock.jsx';
import TextWorkshop from '../blocks/TextWorkshop.jsx';
import ListBlock from '../blocks/ListBlock.jsx';
import ReferenceBlock from '../blocks/ReferenceBlock.jsx';
import MediaBlock from '../blocks/MediaBlock.jsx';
import ComparisonBlock from '../blocks/ComparisonBlock.jsx';

// Mirrors TEST_SPACE_ID in backend/src/db/queries.js -- the frontend
// and backend are separate bundles, so this can't be a shared import,
// only a matching literal (same reasoning as SKELETON_LANE_LABELS in
// skeleton.js mirroring the backend's SKELETON_LANES).
const TEST_SPACE_ID = 'test-space';

// The only inline attribution tags a Text block's content.tag can hold.
// Exported so any future UI for creating/editing Text blocks reads
// this list instead of redefining it.
export const TEXT_ATTRIBUTION_TAGS = ['quote', 'paraphrase', 'reflection', 'inference'];

// The only values a List item's confidence property can hold.
export const CONFIDENCE_LEVELS = ['solid', 'tentative', 'questioned'];

// The only kinds a Media block's content.mediaType can hold. Only
// 'image' actually renders anything yet -- see MediaBlock.jsx.
export const MEDIA_TYPES = ['image', 'audio', 'sketch'];

// A self-contained SVG data URI so the Media demo renders with no
// dependency on external network access -- same trick the seeded demo
// data uses (see backend/src/db/seedTestSpace.js).
const DEMO_IMAGE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>" +
  "<rect width='100%' height='100%' fill='#ddd'/>" +
  "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16'>Demo image</text>" +
  '</svg>';
const DEMO_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(DEMO_IMAGE_SVG)}`;

export const blockRegistry = {
  text: {
    label: 'Text',
    description:
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.',
    component: TextBlock,
    workshopComponent: TextWorkshop,
    worksWith: ['comparison'],
    demoBlock: {
      type: 'text',
      content: { tag: 'reflection', text: 'A demo paragraph, showing how a Text block reads.' },
      properties: {},
    },
  },
  list: {
    label: 'List',
    description:
      'An ordered set of items. Each item can optionally carry a checkbox, a number, a date, or a confidence marker.',
    component: ListBlock,
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
    component: ReferenceBlock,
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
    description: 'An image, audio clip, or embedded sketch. Only images render for now.',
    component: MediaBlock,
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
      'Two Text or Reference blocks shown side by side, optionally marked as a contrast.',
    component: ComparisonBlock,
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
};
