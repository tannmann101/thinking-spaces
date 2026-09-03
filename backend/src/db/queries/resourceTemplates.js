import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { logActivity } from './activityLog.js';
import { recordTrash } from './trash.js';

// --- Resource Templates -------------------------------------------------
// A deliberately separate mechanism from the ordinary Templates table
// (templates.js) -- confirmed via direct question. Where a Space
// Template seeds a block_arrangement wholesale, a Resource Template
// instead REPLACES CreateResource.jsx's three generic descriptive
// facets (What It Is / What It Affords / What It Offers) with a
// type-tailored set of its own, keyed by `type` (matching a Resource's
// own type tag, e.g. 'book'). See schema.sql's own comment for why the
// fourth, structural facet (Touches / Touched By) stays universal and
// is never part of `facets`.

function parseResourceTemplateRow(row) {
  if (!row) return row;
  return { ...row, facets: JSON.parse(row.facets) };
}

export function listResourceTemplates() {
  const rows = db.prepare(`SELECT * FROM resource_templates ORDER BY label ASC`).all();
  return rows.map(parseResourceTemplateRow);
}

export function getResourceTemplateById(id) {
  return parseResourceTemplateRow(db.prepare(`SELECT * FROM resource_templates WHERE id = ?`).get(id));
}

// Case-insensitive, since a Resource's own type tags are lowercased at
// entry (see CreateResource.jsx's addType) but a Template's `type` is
// typed in by hand wherever it's authored.
export function getResourceTemplateByType(type) {
  return parseResourceTemplateRow(
    db.prepare(`SELECT * FROM resource_templates WHERE lower(type) = lower(?)`).get(type)
  );
}

// id is optional, same reasoning as createTemplate: a fixed id for the
// built-in Resource Templates seeded at startup (see
// seedResourceTemplates.js).
export function createResourceTemplate({ id = randomUUID(), type, label, facets }) {
  db.prepare(`INSERT INTO resource_templates (id, type, label, facets) VALUES (?, ?, ?, ?)`).run(
    id,
    type,
    label,
    JSON.stringify(facets)
  );
  const summary = `Created Resource Template "${label}"`;
  logActivity({ kind: 'resource_template_created', summary });
  return { ...getResourceTemplateById(id), changeSummary: summary };
}

export function updateResourceTemplate(id, { type, label, facets }) {
  db.prepare(
    `UPDATE resource_templates SET type = ?, label = ?, facets = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(type, label, JSON.stringify(facets), id);
  const summary = `Updated Resource Template "${label}"`;
  logActivity({ kind: 'resource_template_updated', summary });
  return { ...getResourceTemplateById(id), changeSummary: summary };
}

export function deleteResourceTemplate(id) {
  const trashed = getResourceTemplateById(id);
  if (trashed) {
    recordTrash({
      kind: 'resource_template',
      label: trashed.label || '(untitled)',
      context: null,
      payload: { resource_templates: db.prepare(`SELECT * FROM resource_templates WHERE id = ?`).all(id) },
    });
  }
  const existing = getResourceTemplateById(id);
  db.prepare(`DELETE FROM resource_templates WHERE id = ?`).run(id);
  if (existing) {
    logActivity({ kind: 'resource_template_deleted', summary: `Deleted Resource Template "${existing.label}"` });
  }
}
