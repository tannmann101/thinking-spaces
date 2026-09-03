// Ported from backend/src/db/queries/resourceTemplates.js. The 17
// built-in Resource Templates aren't seeded by app code here (unlike
// the Node backend's seedResourceTemplates.js, called at startup) --
// see worker/resource-templates-seed.sql, applied once via wrangler d1
// execute during deployment, same reasoning worker/templates-seed.sql
// already established.

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

export async function getResourceTemplateByType(env, type) {
  return parseResourceTemplateRow(
    await env.DB.prepare(`SELECT * FROM resource_templates WHERE lower(type) = lower(?)`).bind(type).first()
  );
}

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
