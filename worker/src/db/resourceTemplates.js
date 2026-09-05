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
//
// The 17
// built-in Resource Templates aren't seeded by app code here (unlike
// a Worker has no boot hook to run a seeder in) -- see
// worker/resource-templates-seed.sql, applied once, same reasoning
// worker/templates-seed.sql already established.

import { logActivity } from './activityLog.js';
import { recordTrash } from './trash.js';

function parseResourceTemplateRow(row) {
  if (!row) return row;
  return { ...row, facets: JSON.parse(row.facets) };
}

export async function listResourceTemplates(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM resource_templates ORDER BY label ASC`).all();
  return results.map(parseResourceTemplateRow);
}

export async function getResourceTemplateById(env, id) {
  return parseResourceTemplateRow(await env.DB.prepare(`SELECT * FROM resource_templates WHERE id = ?`).bind(id).first());
}

// Case-insensitive, since a Resource's own type tags are lowercased at
// entry (see CreateResource.jsx's addType) but a Template's `type` is
// typed in by hand wherever it's authored.
export async function getResourceTemplateByType(env, type) {
  return parseResourceTemplateRow(
    await env.DB.prepare(`SELECT * FROM resource_templates WHERE lower(type) = lower(?)`).bind(type).first()
  );
}

// id is optional, same reasoning as createTemplate: a fixed id for the
// built-in Resource Templates (see resource-templates-seed.sql).
export async function createResourceTemplate(env, { id = crypto.randomUUID(), type, label, facets }) {
  await env.DB.prepare(`INSERT INTO resource_templates (id, type, label, facets) VALUES (?, ?, ?, ?)`)
    .bind(id, type, label, JSON.stringify(facets))
    .run();
  const summary = `Created Resource Template "${label}"`;
  await logActivity(env, { kind: 'resource_template_created', summary });
  return { ...(await getResourceTemplateById(env, id)), changeSummary: summary };
}

export async function updateResourceTemplate(env, id, { type, label, facets }) {
  await env.DB.prepare(
    `UPDATE resource_templates SET type = ?, label = ?, facets = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(type, label, JSON.stringify(facets), id)
    .run();
  const summary = `Updated Resource Template "${label}"`;
  await logActivity(env, { kind: 'resource_template_updated', summary });
  return { ...(await getResourceTemplateById(env, id)), changeSummary: summary };
}

export async function deleteResourceTemplate(env, id) {
  const trashed = await getResourceTemplateById(env, id);
  if (trashed) {
    const rows = (await env.DB.prepare(`SELECT * FROM resource_templates WHERE id = ?`).bind(id).all()).results;
    await recordTrash(env, {
      kind: 'resource_template',
      label: trashed.label || '(untitled)',
      context: null,
      payload: { resource_templates: rows },
    });
  }
  const existing = await getResourceTemplateById(env, id);
  await env.DB.prepare(`DELETE FROM resource_templates WHERE id = ?`).bind(id).run();
  if (existing) {
    await logActivity(env, { kind: 'resource_template_deleted', summary: `Deleted Resource Template "${existing.label}"` });
  }
}
