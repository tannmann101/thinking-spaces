// Shared row helpers for the three Mapping Tools (Word Evolution,
// Concept Map, Model). All three are shaped the same way underneath --
// one headline field plus an ordered array of rows you add to, edit,
// reorder and remove -- so these four pure functions live here rather
// than being written out three times and drifting apart, the same
// reasoning textLinks.jsx and listItems.js already follow.
//
// Deliberately plain array operations, not a generic row-editing
// abstraction: each Tool still renders and labels its own rows, because
// a word's sense-shift, a rendering of a referent, and a component of a
// model are genuinely different things that happen to be stored alike.

export function addRow(rows, row) {
  return [...(rows || []), { id: crypto.randomUUID(), ...row }];
}

export function updateRow(rows, id, patch) {
  return (rows || []).map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function removeRow(rows, id) {
  return (rows || []).filter((row) => row.id !== id);
}

// direction is -1 (up) or +1 (down). Out-of-range moves are a no-op
// rather than an error, so the caller can render both buttons always
// and let the ends simply do nothing.
export function moveRow(rows, id, direction) {
  const list = [...(rows || [])];
  const index = list.findIndex((row) => row.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= list.length) return list;
  [list[index], list[target]] = [list[target], list[index]];
  return list;
}

// How far a rendering sits from the referent it claims to name (see
// ConceptMapBlock.jsx). A fixed three-value scale rather than free text
// so divergences can be seen at a glance instead of read for -- the same
// reasoning behind the fixed confidence scale. Lives here rather than in
// the component so the component file exports only its component.
export const ALIGNMENTS = [
  { key: 'aligned', label: 'Aligned', hint: 'Renders the referent as it actually is' },
  { key: 'partial', label: 'Partial', hint: 'Catches part of it, misses or adds something' },
  { key: 'divergent', label: 'Divergent', hint: 'Points somewhere else while using the same word' },
];
