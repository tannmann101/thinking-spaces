// The 6 built-in Templates themselves aren't seeded by app code: a
// Worker has no boot hook to run a seeder in, and re-checking on every
// request would mean real extra D1 queries forever for something that
// only has to happen once. worker/templates-seed.sql declares them
// instead, applied once (npm run setup locally, wrangler d1 execute
// against the deployed database) -- same reasoning ensureTestSpaceExists
// stayed out of runtime code (see spaces.js).

import { logActivity } from './activityLog.js';
import { createBlock } from './blocks.js';
import { recordTrash } from './trash.js';

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

// id is optional, same reasoning as createSpace (spaces.js): a fixed id
// for the built-in Templates (see templates-seed.sql).
export async function createTemplate(env, { id = crypto.randomUUID(), name, blockArrangement }) {
  await env.DB.prepare(`INSERT INTO templates (id, name, block_arrangement) VALUES (?, ?, ?)`)
    .bind(id, name, JSON.stringify(blockArrangement))
    .run();
  const summary = `Created template "${name}"`;
  await logActivity(env, { kind: 'template_created', summary });
  return { ...(await getTemplateById(env, id)), changeSummary: summary };
}

// Editing a Template only ever touches the templates table -- it never
// reaches into any Space, because applyTemplate (below) only ever runs
// once, at Space-creation time. There's no ongoing link for an edit to
// travel through.
export async function updateTemplate(env, id, { name, blockArrangement }) {
  await env.DB.prepare(`UPDATE templates SET name = ?, block_arrangement = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(name, JSON.stringify(blockArrangement), id)
    .run();
  const summary = `Updated template "${name}"`;
  await logActivity(env, { kind: 'template_updated', summary });
  return { ...(await getTemplateById(env, id)), changeSummary: summary };
}

export async function deleteTemplate(env, id) {
  const trashed = await getTemplateById(env, id);
  if (trashed) {
    const rows = (await env.DB.prepare(`SELECT * FROM templates WHERE id = ?`).bind(id).all()).results;
    await recordTrash(env, {
      kind: 'template',
      label: trashed.name || '(untitled)',
      context: null,
      payload: { templates: rows },
    });
  }
  const existing = await getTemplateById(env, id);
  await env.DB.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run();
  if (existing) {
    await logActivity(env, { kind: 'template_deleted', summary: `Deleted template "${existing.name}"` });
  }
}

// Applying a Template is a one-time copy, per CLAUDE.md -- not a live
// link back to the template. Each block spec in block_arrangement is
// just the same shape createBlock already takes.
export async function applyTemplate(env, spaceId, templateId) {
  const template = await getTemplateById(env, templateId);
  if (!template) return;
  for (const blockSpec of template.block_arrangement) {
    await createBlock(env, { spaceId, ...blockSpec });
  }
}
