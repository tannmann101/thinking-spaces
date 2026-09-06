// Two pure content-shape normalizers, kept out of blocks.js so that
// anything needing one doesn't have to depend on the whole of blocks.js
// to get it. No D1 dependency at all -- these only reshape an object.
//
// crypto.randomUUID() is a Web Crypto API, available natively in the
// Workers runtime, so nothing is imported here.

// Every Text block is created through createBlock (blocks.js) -- a
// live "+ Add Block", a Template's stored block spec, seed data, the
// Skeleton's own Current Best Articulation, all of it -- so
// normalizing a Text block's content to the current {lines} shape
// happens exactly once, here, rather than needing every one of those
// call sites to know about it. A caller can still hand this the old
// {tag, text} shape (most do, unchanged) and it lands correctly
// shaped regardless.
export function normalizeTextContent(content) {
  if (content.lines) return content;
  const rawLines = (content.text || '').split('\n');
  const lines = rawLines.map((text) => ({ id: crypto.randomUUID(), text, tag: content.tag || null }));
  return { lines: lines.length > 0 ? lines : [{ id: crypto.randomUUID(), text: '', tag: null }] };
}

// Every Work block (Assessment, Question, ...) is created through this
// same createBlock function, so normalizing its content to the current
// {statement, support, confidence} shape -- support being a list of
// discrete points rather than one `rationale` blob -- happens exactly
// once, here, same reasoning normalizeTextContent already established.
// A caller can still hand this the old {rationale} shape and it lands
// correctly shaped regardless.
export function normalizeWorkContent(content) {
  if (content.support) return content;
  const support = content.rationale ? [{ id: crypto.randomUUID(), text: content.rationale }] : [];
  return { statement: content.statement || '', support, confidence: content.confidence || 'tentative' };
}
