// Built-in Templates. Per CLAUDE.md, a Template is just a named, saved
// starting arrangement of blocks -- applying one is a one-time copy
// (see applyTemplate in queries.js). This file is where those starting
// arrangements are defined, the same way seedTestSpace.js is where
// Test Space demo content is defined.
//
// Five real Space types, per Pass 3's roadmap: Inquiry/Analytical and
// Person-Reflection both use the Skeleton (the doc explicitly says
// Person-Reflection relabels its lanes: "What I Understand" / Evidence
// / "Open Qs" / "Growth Edges" -- same underlying lane keys, so `=`/
// `?`/`!` shorthand still routes correctly, just displayed
// differently). Technical/Practical and Life Management lean on a
// dated log and checkbox/number lists instead (Timeline, Milestone
// Tracker, Ledger Snippet). Creative is the thinnest of the five right
// now: the doc's Mood/Reference Strip (many reorderable Media blocks)
// and Draft Comparison's contrast-promotion aren't built, so it's one
// Media block and one plain notes list, not a full strip.

import { getTemplateById, createTemplate, SKELETON_LANES } from './queries.js';

const today = () => new Date().toISOString().slice(0, 10);

// The last block is a Steelman prompt -- "before finalizing, what's
// the strongest case against this" -- pre-filled as a question rather
// than left blank, since it's a prompt to answer, not a label.
function buildSkeletonBlocks(startPosition, labelOverrides = {}) {
  const laneBlocks = SKELETON_LANES.map((lane, index) => ({
    type: 'list',
    content: { items: [], laneLabel: labelOverrides[lane.key] || lane.label },
    properties: { skeletonLane: lane.key },
    position: startPosition + index,
  }));
  const articulationPosition = startPosition + laneBlocks.length;
  return [
    ...laneBlocks,
    {
      type: 'text',
      content: { tag: null, text: '' },
      properties: { skeletonRole: 'current-best-articulation' },
      position: articulationPosition,
    },
    {
      type: 'text',
      content: {
        tag: null,
        text: 'Steelman: before finalizing, what is the strongest case against your current conclusion?',
      },
      properties: {},
      position: articulationPosition + 1,
    },
  ];
}

const WRITING_SURFACE = { type: 'text', content: { tag: null, text: '' }, properties: {}, position: 0 };

const DEMO_IMAGE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>" +
  "<rect width='100%' height='100%' fill='#ddd'/>" +
  "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16'>Mood/reference image</text>" +
  '</svg>';
const DEMO_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(DEMO_IMAGE_SVG)}`;

const TEMPLATES = [
  {
    id: 'template-inquiry-analytical',
    name: 'Inquiry / Analytical',
    blockArrangement: () => [WRITING_SURFACE, ...buildSkeletonBlocks(1)],
  },
  {
    id: 'template-person-reflection',
    name: 'Person-Reflection',
    blockArrangement: () => [
      WRITING_SURFACE,
      ...buildSkeletonBlocks(1, {
        premises: 'What I Understand',
        'open-questions': 'Open Qs',
        tensions: 'Growth Edges',
      }),
    ],
  },
  {
    id: 'template-technical-practical',
    name: 'Technical / Practical',
    blockArrangement: () => [
      WRITING_SURFACE,
      {
        type: 'list',
        content: {
          laneLabel: 'Progress Log',
          items: [{ id: 'seed-log-1', text: 'Started this', date: today() }],
        },
        properties: {},
        position: 1,
      },
      {
        type: 'list',
        content: {
          laneLabel: 'Milestones',
          items: [{ id: 'seed-milestone-1', text: 'Define the goal', checkbox: false }],
        },
        properties: {},
        position: 2,
      },
    ],
  },
  {
    id: 'template-life-management',
    name: 'Life Management',
    blockArrangement: () => [
      WRITING_SURFACE,
      {
        type: 'list',
        content: {
          laneLabel: 'Timeline',
          items: [{ id: 'seed-timeline-1', text: 'Started thinking about this', date: today() }],
        },
        properties: {},
        position: 1,
      },
      {
        type: 'list',
        content: {
          laneLabel: 'Goals',
          items: [{ id: 'seed-goal-1', text: 'Decide by...', checkbox: false }],
        },
        properties: {},
        position: 2,
      },
      {
        type: 'list',
        content: {
          laneLabel: 'Ledger',
          items: [{ id: 'seed-ledger-1', text: 'Starting point', number: 0 }],
        },
        properties: {},
        position: 3,
      },
    ],
  },
  {
    id: 'template-creative',
    name: 'Creative',
    blockArrangement: () => [
      WRITING_SURFACE,
      {
        type: 'media',
        content: { mediaType: 'image', url: DEMO_IMAGE_URL, caption: '' },
        properties: {},
        position: 1,
      },
      {
        type: 'list',
        content: {
          laneLabel: 'Influences / Notes',
          items: [{ id: 'seed-influence-1', text: 'First influence or reference to track' }],
        },
        properties: {},
        position: 2,
      },
    ],
  },
];

export function seedTemplates() {
  TEMPLATES.forEach(({ id, name, blockArrangement }) => {
    if (getTemplateById(id)) return;
    createTemplate({ id, name, blockArrangement: blockArrangement() });
  });
}
