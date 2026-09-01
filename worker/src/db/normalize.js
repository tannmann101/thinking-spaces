// Ported unchanged from backend/src/db/queries/normalize.js -- pure
// content-shape normalizers, no D1 dependency. crypto.randomUUID() is a
// Web Crypto API, available natively in the Workers runtime the same as
// in Node -- no import needed here (Node's version is imported from
// 'node:crypto' in the original; the Worker just uses the global).

export function normalizeTextContent(content) {
  if (content.lines) return content;
  const rawLines = (content.text || '').split('\n');
  const lines = rawLines.map((text) => ({ id: crypto.randomUUID(), text, tag: content.tag || null }));
  return { lines: lines.length > 0 ? lines : [{ id: crypto.randomUUID(), text: '', tag: null }] };
}

export function normalizeWorkContent(content) {
  if (content.support) return content;
  const support = content.rationale ? [{ id: crypto.randomUUID(), text: content.rationale }] : [];
  return { statement: content.statement || '', support, confidence: content.confidence || 'tentative' };
}
