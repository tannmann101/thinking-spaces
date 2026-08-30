// Demo content for the Test Space -- Pass 2's scratch area. Each time a
// new Block type is implemented, its sample blocks get added here so
// there's always something on screen to demo it with. This is never
// real content (see CLAUDE.md: the Test Space exists explicitly so
// nothing here is mistaken for real content later).

import { TEST_SPACE_ID, countBlocksForSpace, createBlock } from './queries.js';

const SAMPLE_TEXT_BLOCKS = [
  { tag: 'quote', text: 'The map is not the territory.' },
  { tag: 'paraphrase', text: "Korzybski's point, put plainly: any model of something leaves parts of it out." },
  { tag: 'reflection', text: 'This makes me wonder how often my own notes quietly treat a model as the real thing.' },
  { tag: 'inference', text: 'If every representation is necessarily incomplete, no single Space here can capture a topic fully on its own.' },
];

function seedTextBlocks() {
  if (countBlocksForSpace(TEST_SPACE_ID, 'text') > 0) return;
  SAMPLE_TEXT_BLOCKS.forEach((sample, index) => {
    createBlock({
      spaceId: TEST_SPACE_ID,
      type: 'text',
      content: { text: sample.text, tag: sample.tag },
      position: index,
    });
  });
}

const SAMPLE_LIST_ITEMS = [
  { id: 'item-plain', text: 'A plain item with no property at all' },
  { id: 'item-checkbox', text: 'Read the primary source', checkbox: false },
  { id: 'item-number', text: 'Estimated word count for this Space', number: 1200 },
  { id: 'item-date', text: 'Revisit this line of thinking', date: '2026-09-15' },
  { id: 'item-confidence', text: 'This claim likely holds up under scrutiny', confidence: 'tentative' },
];

function seedListBlock() {
  if (countBlocksForSpace(TEST_SPACE_ID, 'list') > 0) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: SAMPLE_LIST_ITEMS },
    position: 4,
  });
}

export function seedTestSpaceBlocks() {
  seedTextBlocks();
  seedListBlock();
}
