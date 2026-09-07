// THE View registry. Per CLAUDE.md: Views are "generic renderers
// computed over blocks that share a property, not separate registered
// tools" -- so a View isn't assigned to a block by anyone, it's
// automatically offered whenever a block's data happens to fit. This
// file is the one place that decides, for a given Block, which Views
// apply (`appliesTo`) and what renders them (`component`).
//
// A block can match more than one View at once -- e.g. a daily
// checkbox List genuinely is a Streak, a Progress bar, and a Timeline
// all at once, since it has both a date and a checkbox on every item.
// That overlap is expected, not a bug: it's what "computed over shared
// properties" means in practice.
//
// `worksWith` and `demoBlock` exist purely for the Tools catalog page
// (ToolsPage.jsx) -- see the matching comment in registry/blocks.js.
// Every View here demos over a plain List block, since that is what a
// View is: a computed reading of one block's own items.
//
// `icon`, same reasoning as blockRegistry's own field: a small,
// restrained per-Tool glyph so the Tools catalog doesn't read as one
// flat wall of identical cards.

import TimelineView from '../views/TimelineView.jsx';
import ProgressView from '../views/ProgressView.jsx';
import StreakView from '../views/StreakView.jsx';
import LedgerView from '../views/LedgerView.jsx';

function isListBlock(block) {
  return block.type === 'list' && Array.isArray(block.content.items);
}

export const viewRegistry = {
  timeline: {
    label: 'Timeline',
    description: 'List items that carry a date, shown chronologically.',
    icon: '▸',
    appliesTo: (block) => isListBlock(block) && block.content.items.some((item) => item.date),
    component: TimelineView,
    worksWith: ['list'],
    demoBlock: {
      type: 'list',
      content: {
        items: [
          { id: 'demo-1', text: 'Started sketching this out', date: '2026-08-01' },
          { id: 'demo-2', text: 'Finished a first draft', date: '2026-08-20' },
        ],
      },
    },
  },
  progress: {
    label: 'Progress',
    description: 'List items that carry a checkbox, shown as a completion bar.',
    icon: '◐',
    appliesTo: (block) =>
      isListBlock(block) && block.content.items.some((item) => typeof item.checkbox === 'boolean'),
    component: ProgressView,
    worksWith: ['list'],
    demoBlock: {
      type: 'list',
      content: {
        items: [
          { id: 'demo-1', text: 'Step one', checkbox: true },
          { id: 'demo-2', text: 'Step two', checkbox: false },
          { id: 'demo-3', text: 'Step three', checkbox: false },
        ],
      },
    },
  },
  streak: {
    label: 'Streak',
    description: 'A daily checkbox List (items with both a date and a checkbox), calendar-rendered.',
    icon: '⟳',
    appliesTo: (block) =>
      isListBlock(block) &&
      block.content.items.some((item) => typeof item.checkbox === 'boolean' && item.date),
    component: StreakView,
    worksWith: ['list'],
    demoBlock: {
      type: 'list',
      content: {
        items: [
          { id: 'demo-1', text: 'Day', date: '2026-08-01', checkbox: true },
          { id: 'demo-2', text: 'Day', date: '2026-08-02', checkbox: true },
          { id: 'demo-3', text: 'Day', date: '2026-08-03', checkbox: false },
          { id: 'demo-4', text: 'Day', date: '2026-08-04', checkbox: true },
        ],
      },
    },
  },
  ledger: {
    label: 'Ledger',
    description: 'List items that carry a number, shown with a running total.',
    icon: 'Σ',
    appliesTo: (block) =>
      isListBlock(block) && block.content.items.some((item) => typeof item.number === 'number'),
    component: LedgerView,
    worksWith: ['list'],
    demoBlock: {
      type: 'list',
      content: {
        items: [
          { id: 'demo-1', text: 'Starting balance', number: 100 },
          { id: 'demo-2', text: 'Spent on research', number: -20 },
        ],
      },
    },
  },
};
