// Built-in Templates. Per CLAUDE.md, a Template is just a named, saved
// starting arrangement of blocks -- applying one is a one-time copy
// (see applyTemplate in queries.js). This file is where those starting
// arrangements are defined, the same way seedTestSpace.js is where
// Test Space demo content is defined.
//
// Only one template so far: Inquiry/Analytical, since it maps directly
// onto the Skeleton already built (Pass 3's roadmap describes five
// real Space types in total -- the other four are a separate content
// question, not implemented here).

import { getTemplateById, createTemplate, SKELETON_LANES } from './queries.js';

const INQUIRY_ANALYTICAL_TEMPLATE_ID = 'template-inquiry-analytical';

export function seedTemplates() {
  if (getTemplateById(INQUIRY_ANALYTICAL_TEMPLATE_ID)) return;

  const laneBlocks = SKELETON_LANES.map((lane, index) => ({
    type: 'list',
    content: { items: [], laneLabel: lane.label },
    properties: { skeletonLane: lane.key },
    position: index + 1,
  }));

  createTemplate({
    id: INQUIRY_ANALYTICAL_TEMPLATE_ID,
    name: 'Inquiry / Analytical',
    blockArrangement: [
      { type: 'text', content: { tag: null, text: '' }, properties: {}, position: 0 },
      ...laneBlocks,
      {
        type: 'text',
        content: { tag: null, text: '' },
        properties: { skeletonRole: 'current-best-articulation' },
        position: laneBlocks.length + 1,
      },
    ],
  });
}
