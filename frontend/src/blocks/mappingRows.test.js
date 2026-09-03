import { describe, it, expect } from 'vitest';
import { addRow, updateRow, removeRow, moveRow, ALIGNMENTS } from './mappingRows.js';

describe('mappingRows', () => {
  it('addRow appends a row carrying a generated id', () => {
    const rows = addRow([], { name: 'first' });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('first');
    expect(rows[0].id).toEqual(expect.any(String));
  });

  it('addRow tolerates a missing array, so a brand-new block can take its first row', () => {
    expect(addRow(undefined, { name: 'first' })).toHaveLength(1);
  });

  it('updateRow patches only the named row and leaves the others alone', () => {
    const rows = [
      { id: 'a', name: 'one' },
      { id: 'b', name: 'two' },
    ];
    expect(updateRow(rows, 'b', { name: 'changed' })).toEqual([
      { id: 'a', name: 'one' },
      { id: 'b', name: 'changed' },
    ]);
  });

  it('removeRow drops just the named row', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(removeRow(rows, 'a')).toEqual([{ id: 'b' }]);
  });

  it('moveRow swaps a row with its neighbour', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveRow(rows, 'b', -1).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(moveRow(rows, 'b', 1).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('moveRow is a no-op at either end rather than an error', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(moveRow(rows, 'a', -1).map((r) => r.id)).toEqual(['a', 'b']);
    expect(moveRow(rows, 'b', 1).map((r) => r.id)).toEqual(['a', 'b']);
    expect(moveRow(rows, 'missing', 1).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('moveRow returns a new array rather than mutating the one passed in', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    moveRow(rows, 'a', 1);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('ALIGNMENTS is the three-value scale the Concept Map cycles through', () => {
    expect(ALIGNMENTS.map((a) => a.key)).toEqual(['aligned', 'partial', 'divergent']);
    ALIGNMENTS.forEach((a) => {
      expect(a.label).toEqual(expect.any(String));
      expect(a.hint).toEqual(expect.any(String));
    });
  });
});
