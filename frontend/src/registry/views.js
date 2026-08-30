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
    appliesTo: (block) => isListBlock(block) && block.content.items.some((item) => item.date),
    component: TimelineView,
  },
  progress: {
    label: 'Progress',
    description: 'List items that carry a checkbox, shown as a completion bar.',
    appliesTo: (block) =>
      isListBlock(block) && block.content.items.some((item) => typeof item.checkbox === 'boolean'),
    component: ProgressView,
  },
  streak: {
    label: 'Streak',
    description: 'A daily checkbox List (items with both a date and a checkbox), calendar-rendered.',
    appliesTo: (block) =>
      isListBlock(block) &&
      block.content.items.some((item) => typeof item.checkbox === 'boolean' && item.date),
    component: StreakView,
  },
  ledger: {
    label: 'Ledger',
    description: 'List items that carry a number, shown with a running total.',
    appliesTo: (block) =>
      isListBlock(block) && block.content.items.some((item) => typeof item.number === 'number'),
    component: LedgerView,
  },
};
