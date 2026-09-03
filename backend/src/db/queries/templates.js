import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';
import { createBlock } from './blocks.js';
import { recordTrash } from './trash.js';

function parseTemplateRow(row) {
  if (!row) return row;
  return { ...row, block_arrangement: JSON.parse(row.block_arrangement) };
}

export function listTemplates() {
  const rows = db
    .prepare(
      `SELECT id, name, block_arrangement, created_at, updated_at
       FROM templates
       ORDER BY name ASC`
    )
    .all();
  return rows.map(parseTemplateRow);
}

export function getTemplateById(id) {
  const row = db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id);
  return parseTemplateRow(row);
}

// id is optional, same reasoning as createSpace (spaces.js): a fixed id
// for the built-in templates seeded at startup (see seedTemplates.js).
export function createTemplate({ id = randomUUID(), name, blockArrangement }) {
  db.prepare(
    `INSERT INTO templates (id, name, block_arrangement) VALUES (?, ?, ?)`
  ).run(id, name, JSON.stringify(blockArrangement));
  const summary = `Created template "${name}"`;
  logActivity({ kind: 'template_created', summary });
  return { ...getTemplateById(id), changeSummary: summary };
}

// Editing a Template only ever touches the templates table -- it never
// reaches into any Space, because applyTemplate (below) only ever runs
// once, at Space-creation time. There's no ongoing link for an edit to
// travel through.
export function updateTemplate(id, { name, blockArrangement }) {
  db.prepare(
    `UPDATE templates SET name = ?, block_arrangement = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, JSON.stringify(blockArrangement), id);
  const summary = `Updated template "${name}"`;
  logActivity({ kind: 'template_updated', summary });
  return { ...getTemplateById(id), changeSummary: summary };
}

export function deleteTemplate(id) {
  const trashed = getTemplateById(id);
  if (trashed) {
    recordTrash({
      kind: 'template',
      label: trashed.name || '(untitled)',
      context: null,
      payload: { templates: db.prepare(`SELECT * FROM templates WHERE id = ?`).all(id) },
    });
  }
  const existing = getTemplateById(id);
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
  if (existing) {
    logActivity({ kind: 'template_deleted', summary: `Deleted template "${existing.name}"` });
  }
}

// Applying a Template is a one-time copy, per CLAUDE.md -- not a live
// link back to the template. Each block spec in block_arrangement is
// just the same shape createBlock already takes.
export function applyTemplate(spaceId, templateId) {
  const template = getTemplateById(templateId);
  if (!template) return;
  template.block_arrangement.forEach((blockSpec) => {
    createBlock({ spaceId, ...blockSpec });
  });
}
