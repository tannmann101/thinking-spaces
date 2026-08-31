// Shared List-item shape logic, used by both the ordinary inline
// ListBlock and the List Workshop -- a list's items are meant to be
// uniform in shape (a Ledger's items all carry `number`; a Skeleton
// lane's all carry `confidence`), since Views computed over a list
// (Progress, Ledger, Streak) assume that uniformity. So a new item's
// shape is always inferred from whatever's already there.

// Mirrors CONFIDENCE_LEVELS in registry/blocks.js -- kept as a
// separate export since this file predates that one and other code
// already imports CONFIDENCE_CYCLE from here; both must stay in sync.
export const CONFIDENCE_CYCLE = ['questioned', 'tentative', 'moderate', 'solid', 'certain'];

// `shapeOverride` is only meaningful when `items` is empty -- there's
// nothing to infer a shape from yet, so the List Workshop lets the very
// first item establish the list's shape explicitly instead of leaving
// every list that starts empty stuck as plain text forever (see
// ListWorkshop.jsx's shape picker). Every item after that keeps
// inferring from items[0], exactly as before.
export function buildNewItem(text, items, isSkeletonLane, shapeOverride = null) {
  const item = { id: crypto.randomUUID(), text };
  const sample = items[0];
  const shape = sample || shapeOverride || {};
  if (isSkeletonLane || shape.confidence) item.confidence = 'tentative';
  if (typeof shape.checkbox === 'boolean' || shape.checkbox === true) item.checkbox = false;
  if (typeof shape.number === 'number' || shape.number === true) item.number = 0;
  if (shape.date === true || (sample && sample.date)) item.date = new Date().toISOString().slice(0, 10);
  if (shape.reviewBy === true || (sample && sample.reviewBy)) {
    item.reviewBy = new Date().toISOString().slice(0, 10);
  }
  if (typeof shape.flagged === 'boolean' || shape.flagged === true) item.flagged = false;
  return item;
}
