// Demo content for the Test Space -- Pass 2's scratch area. Each time a
// new Block type or View is implemented, its sample blocks get added
// here so there's always something on screen to demo it with. This is
// never real content (see CLAUDE.md: the Test Space exists explicitly
// so nothing here is mistaken for real content later).
//
// Each seeded block is pinned to a fixed `position`, and each seed
// function below checks its own position before inserting -- so adding
// one new demo block never blocks or duplicates another.

import { TEST_SPACE_ID, countBlocksForSpace, createBlock, blockExistsAtPosition } from './queries.js';

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

function seedGeneralListBlock() {
  if (blockExistsAtPosition(TEST_SPACE_ID, 4)) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: SAMPLE_LIST_ITEMS },
    position: 4,
  });
}

// Timeline demo: items carry only a date, so only the Timeline View
// picks this block up.
const TIMELINE_ITEMS = [
  { id: 'timeline-1', text: 'First sketched out this whole substrate idea', date: '2026-06-02' },
  { id: 'timeline-2', text: 'Decided to collapse the heavier architecture into Blocks/Views/Templates', date: '2026-07-14' },
  { id: 'timeline-3', text: 'Wrote the CLAUDE.md working method', date: '2026-08-20' },
  { id: 'timeline-4', text: 'Pass 1 shipped: Dashboard, Creation flow, Test Space', date: '2026-08-30' },
];

function seedTimelineDemo() {
  if (blockExistsAtPosition(TEST_SPACE_ID, 5)) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: TIMELINE_ITEMS },
    position: 5,
  });
}

// Progress demo: items carry only a checkbox, so only the Progress View
// picks this block up.
const PROGRESS_ITEMS = [
  { id: 'progress-1', text: 'Outline the argument', checkbox: true },
  { id: 'progress-2', text: 'Draft the first section', checkbox: true },
  { id: 'progress-3', text: 'Draft the second section', checkbox: false },
  { id: 'progress-4', text: 'Find counterexamples', checkbox: false },
  { id: 'progress-5', text: 'Write the conclusion', checkbox: false },
];

function seedProgressDemo() {
  if (blockExistsAtPosition(TEST_SPACE_ID, 6)) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: PROGRESS_ITEMS },
    position: 6,
  });
}

// Streak demo: 14 consecutive days of a daily habit, each item
// carrying both a checkbox and a date -- which is exactly what a
// "daily checkbox List" is, so this block naturally also qualifies for
// the Progress and Timeline Views (a streak is, generically, both of
// those things too). Two misses are included so the calendar isn't a
// perfect row of checkmarks.
function buildStreakItems() {
  const items = [];
  const start = new Date('2026-08-17T00:00:00Z');
  const misses = new Set([3, 9]);
  for (let i = 0; i < 14; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const iso = day.toISOString().slice(0, 10);
    items.push({
      id: `streak-${iso}`,
      text: 'Morning pages',
      date: iso,
      checkbox: !misses.has(i),
    });
  }
  return items;
}

function seedStreakDemo() {
  if (blockExistsAtPosition(TEST_SPACE_ID, 7)) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: buildStreakItems() },
    position: 7,
  });
}

// Ledger demo: items carry only a number (one of them negative, since
// a running total should handle subtraction too), so only the Ledger
// View picks this block up.
const LEDGER_ITEMS = [
  { id: 'ledger-1', text: 'Starting word count', number: 0 },
  { id: 'ledger-2', text: 'Drafted the intro', number: 420 },
  { id: 'ledger-3', text: 'Drafted the middle section', number: 810 },
  { id: 'ledger-4', text: 'Drafted the conclusion', number: 260 },
  { id: 'ledger-5', text: 'Cut a redundant paragraph', number: -150 },
];

function seedLedgerDemo() {
  if (blockExistsAtPosition(TEST_SPACE_ID, 8)) return;
  createBlock({
    spaceId: TEST_SPACE_ID,
    type: 'list',
    content: { items: LEDGER_ITEMS },
    position: 8,
  });
}

export function seedTestSpaceBlocks() {
  seedTextBlocks();
  seedGeneralListBlock();
  seedTimelineDemo();
  seedProgressDemo();
  seedStreakDemo();
  seedLedgerDemo();
}
