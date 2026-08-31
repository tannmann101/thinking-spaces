import { randomUUID } from 'node:crypto';

// Two pure content-shape normalizers, split out of blocks.js because
// both work.js (migrateWorkItemSupport) and skeleton.js
// (migrateTextBlockLines) need one of these without needing anything
// else blocks.js has -- keeping them here avoids those two modules
// depending on the whole of blocks.js just for a shape-upgrade helper.

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
  const lines = rawLines.map((text) => ({ id: randomUUID(), text, tag: content.tag || null }));
  return { lines: lines.length > 0 ? lines : [{ id: randomUUID(), text: '', tag: null }] };
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
  const support = content.rationale ? [{ id: randomUUID(), text: content.rationale }] : [];
  return { statement: content.statement || '', support, confidence: content.confidence || 'tentative' };
}
