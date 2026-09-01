// Ported from backend/src/db/queries/templates.js. The 6 built-in
// Templates themselves aren't seeded by app code here (unlike the Node
// backend's seedTemplates.js, called at startup) -- see
// worker/templates-seed.sql, applied once via wrangler d1 execute
// during deployment, same reasoning ensureTestSpaceExists moved out of
// runtime code (see spaces.js).

import { logActivity } from './activityLog.js';
import { createBlock } from './blocks.js';

function parseTemplateRow(row) {
  if (!row) return row;
  return { ...row, block_arrangement: JSON.parse(row.block_arrangement) };
}

export async function listTemplates(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, block_arrangement, created_at, updated_at FROM templates ORDER BY name ASC`
  ).all();
  return results.map(parseTemplateRow);
}

export async function getTemplateById(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM templates WHERE id = ?`).bind(id).first();
  return parseTemplateRow(row);
}

export async function createTemplate(env, { id = crypto.randomUUID(), name, blockArrangement }) {
  await env.DB.prepare(`INSERT INTO templates (id, name, block_arrangement) VALUES (?, ?, ?)`)
    .bind(id, name, JSON.stringify(blockArrangement))
    .run();
  await logActivity(env, { kind: 'template_created', summary: `Created template "${name}"` });
  return getTemplateById(env, id);
}

export async function updateTemplate(env, id, { name, blockArrangement }) {
  await env.DB.prepare(`UPDATE templates SET name = ?, block_arrangement = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(name, JSON.stringify(blockArrangement), id)
    .run();
  await logActivity(env, { kind: 'template_updated', summary: `Updated template "${name}"` });
  return getTemplateById(env, id);
}

export async function deleteTemplate(env, id) {
  const existing = await getTemplateById(env, id);
  await env.DB.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run();
  if (existing) {
    await logActivity(env, { kind: 'template_deleted', summary: `Deleted template "${existing.name}"` });
  }
}

// Applying a Template is a one-time copy, never a live link back to it.
export async function applyTemplate(env, spaceId, templateId) {
  const template = await getTemplateById(env, templateId);
  if (!template) return;
  for (const blockSpec of template.block_arrangement) {
    await createBlock(env, { spaceId, ...blockSpec });
  }
}
