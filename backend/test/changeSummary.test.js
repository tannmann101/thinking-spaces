import { describe, it, expect } from 'vitest';
import { describeBlockContentChange } from '../src/changeSummary.js';

function milestoneBlock(reached) {
  return { type: 'milestone', content: { reached } };
}

describe('describeBlockContentChange: Milestone reached toggle', () => {
  it('describes marking a Milestone reached', () => {
    expect(describeBlockContentChange(milestoneBlock(false), { reached: true })).toBe(
      'Milestone reached -- now counted in Insights and the Week digest'
    );
  });

  it('describes unmarking a Milestone', () => {
    expect(describeBlockContentChange(milestoneBlock(true), { reached: false })).toBe(
      'Milestone unmarked -- no longer counted as reached'
    );
  });

  it('returns null when reached does not actually change', () => {
    expect(describeBlockContentChange(milestoneBlock(true), { reached: true })).toBeNull();
    expect(describeBlockContentChange(milestoneBlock(false), { reached: false })).toBeNull();
  });

  it('returns null for a field change on a Milestone that is not reached', () => {
    expect(describeBlockContentChange(milestoneBlock(false), { label: 'New label', reached: false })).toBeNull();
  });
});

describe('describeBlockContentChange: other block types', () => {
  it('returns null for a non-Milestone block, regardless of content', () => {
    expect(describeBlockContentChange({ type: 'text', content: { lines: [] } }, { lines: [{ text: 'x' }] })).toBeNull();
  });
});
