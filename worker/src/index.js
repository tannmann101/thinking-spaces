// Thinking Spaces API -- Cloudflare Worker + D1 port of the Express +
// better-sqlite3 backend under backend/src/. Every route here mirrors
// its Express counterpart in backend/src/routes/*.js exactly (same
// path, same validation, same status codes) -- this file is the
// equivalent of backend/src/index.js's app.use(...) wiring plus every
// route handler, hand-rolled the same way gardners-hub's own Worker
// router is, since a framework like Express isn't available inside a
// Worker.
//
// Same-origin only: this expects to sit behind the same Cloudflare
// Access gate as the rest of thegardners.xyz (see worker/DEPLOY.md), so
// -- like gardners-hub's own Worker -- it does no auth of its own.

import {
  listSpaces,
  listSpacesByTag,
  getSpaceById,
  createSpaceWithSetup,
  createRelationalSpace,
  updateSpace,
  deleteSpace,
} from './db/spaces.js';
import {
  listBlocksForSpace,
  listBacklinksForSpace,
  getBlockById,
  getBlockByIdWithSpaceTitle,
  addBlockToSpace,
  updateBlockContent,
  updateBlockCategories,
  updateBlockWorkspaces,
  updateBlockProject,
  deleteBlock,
  moveBlockInSpace,
  getGraphData,
} from './db/blocks.js';
import {
  listWorkspacesForSpace,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from './db/workspaces.js';
import { listProjectsForSpace, getProjectById, createProject, updateProject, deleteProject } from './db/projects.js';
import { listTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate } from './db/templates.js';
import {
  listResourceTemplates,
  getResourceTemplateById,
  getResourceTemplateByType,
  createResourceTemplate,
  updateResourceTemplate,
  deleteResourceTemplate,
} from './db/resourceTemplates.js';
import { SKELETON_LANES, saveTextBlockWithPromotion, fileLineInLane, createTensionPair, getSkeletonSnapshot, listAllSkeletonClaims } from './db/skeleton.js';
import { listTrailEntries, addManualTrailEntry, updateTrailEntry } from './db/trail.js';
import { getReviewDraft, createReview } from './db/review.js';
import { listWorkItems } from './db/work.js';
import { listGlobalActivity, getActivityStats } from './db/log.js';
import { getWorkMixInsights, getThemeInsights, getActivityTrendInsights, getProvenanceInsights, getTimeInsights } from './db/insights.js';
import { getSpaceReport, getWorkspaceReport, getProjectReport, getBlockReport } from './db/reports.js';
import { listOverdueReviews, getWeekCalendar, suggestSpaceToResurface, getNeedsAttentionCount } from './db/dashboard.js';
import { renderReportText } from './reportFormat.js';

function json(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: data === null ? {} : { 'content-type': 'application/json; charset=utf-8' },
  });
}
function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const LANE_KEYS = new Set(SKELETON_LANES.map((lane) => lane.key));
const CLAIM_LANE_KEYS = new Set(LANE_KEYS);
CLAIM_LANE_KEYS.delete('tensions');

// ---------- Health ----------

async function handleHealth(env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM spaces').first();
  return json({ status: 'ok', message: 'Backend is up and the database is reachable.', spaceCount: row.count, time: new Date().toISOString() });
}

// ---------- Spaces ----------

async function handleListSpaces(request, env) {
  const tag = new URL(request.url).searchParams.get('tag');
  return json(tag ? await listSpacesByTag(env, tag) : await listSpaces(env));
}

async function handleCreateSpace(request, env) {
  const body = (await readJson(request)) || {};
  const { title, templateId, extraBlocks, resourceSpaceIds, tags, categories, workspaces, goal, origin } = body;
  if (!title || !title.trim()) return errorResponse('title is required');
  const space = await createSpaceWithSetup(env, {
    title: title.trim(),
    templateId: templateId || null,
    extraBlocks: extraBlocks || [],
    resourceSpaceIds: resourceSpaceIds || [],
    tags: tags || [],
    categories: categories || [],
    workspaces: workspaces || [],
    goal: goal || null,
    origin: origin || null,
  });
  return json(space, 201);
}

async function handleCreateRelationalSpace(request, env) {
  const body = (await readJson(request)) || {};
  const { title, spaceIds } = body;
  if (!title || !title.trim()) return errorResponse('title is required');
  if (!Array.isArray(spaceIds) || spaceIds.length < 2) return errorResponse('select at least two Spaces');
  return json(await createRelationalSpace(env, { title: title.trim(), spaceIds }), 201);
}

async function handleGetSpace(env, id) {
  const space = await getSpaceById(env, id);
  if (!space) return errorResponse('Space not found', 404);
  return json(space);
}

async function handleUpdateSpace(request, env, id) {
  const body = (await readJson(request)) || {};
  const { title, status, tags, goal, categories, accent, dueDate } = body;
  if (title !== undefined && !title.trim()) return errorResponse('title cannot be empty');
  const updated = await updateSpace(env, id, {
    title: title !== undefined ? title.trim() : undefined,
    status,
    tags,
    goal,
    categories,
    accent,
    dueDate,
  });
  if (!updated) return errorResponse('Space not found', 404);
  return json(updated);
}

async function handleDeleteSpace(env, id) {
  const existing = await getSpaceById(env, id);
  if (!existing) return errorResponse('Space not found', 404);
  try {
    await deleteSpace(env, id);
  } catch (err) {
    return errorResponse(err.message);
  }
  return json(null, 204);
}

async function handleSpaceReport(env, id) {
  const report = await getSpaceReport(env, id);
  if (!report) return errorResponse('Space not found', 404);
  return json({ report, narrative: renderReportText(report) });
}

async function handleReviewDraft(env, id) {
  const draft = await getReviewDraft(env, id);
  if (!draft) return errorResponse('Space not found', 404);
  return json(draft);
}

async function handleCreateReview(env, id) {
  const review = await createReview(env, id);
  if (!review) return errorResponse('Space not found', 404);
  return json(review, 201);
}

async function handleAddManualTrail(request, env, id) {
  const body = (await readJson(request)) || {};
  const { note } = body;
  if (!note || !note.trim()) return errorResponse('note is required');
  return json(await addManualTrailEntry(env, id, note.trim()), 201);
}

async function handleUpdateTrailEntry(request, env, entryId) {
  const body = (await readJson(request)) || {};
  const { note } = body;
  if (typeof note !== 'string' || !note.trim()) return errorResponse('note is required');
  const updated = await updateTrailEntry(env, entryId, note.trim());
  if (!updated) return errorResponse('Trail entry not found', 404);
  return json(updated);
}

// ---------- Blocks ----------

async function handleAddBlock(request, env, spaceId) {
  const body = (await readJson(request)) || {};
  const { type, content, properties } = body;
  if (!type) return errorResponse('type is required');
  return json(await addBlockToSpace(env, spaceId, { type, content, properties }), 201);
}

async function handleMoveBlock(request, env, spaceId, blockId) {
  const body = (await readJson(request)) || {};
  const { direction } = body;
  if (direction !== -1 && direction !== 1) return errorResponse('direction must be -1 or 1');
  await moveBlockInSpace(env, spaceId, blockId, direction);
  return json(await listBlocksForSpace(env, spaceId));
}

async function handlePatchBlock(request, env, id) {
  const existing = await getBlockById(env, id);
  if (!existing) return errorResponse('Entry not found', 404);
  const body = (await readJson(request)) || {};
  const { content, categories, workspaces, projectId } = body;
  if (content === undefined && categories === undefined && workspaces === undefined && projectId === undefined) {
    return errorResponse('content, categories, workspaces, or projectId is required');
  }
  let updated = existing;
  if (content !== undefined) updated = await updateBlockContent(env, id, content);
  if (categories !== undefined) updated = await updateBlockCategories(env, id, categories);
  if (workspaces !== undefined) updated = await updateBlockWorkspaces(env, id, workspaces);
  if (projectId !== undefined) updated = await updateBlockProject(env, id, projectId);
  return json(updated);
}

async function handleBlockReport(env, id) {
  const report = await getBlockReport(env, id);
  if (!report) return errorResponse('Entry not found', 404);
  return json({ report, narrative: renderReportText(report) });
}

async function handleSaveTextBlock(request, env, id) {
  const existing = await getBlockById(env, id);
  if (!existing) return errorResponse('Entry not found', 404);
  const body = (await readJson(request)) || {};
  const { lines } = body;
  if (!Array.isArray(lines)) return errorResponse('lines is required');
  return json(await saveTextBlockWithPromotion(env, id, lines));
}

// ---------- Workspaces ----------

async function handleCreateWorkspace(request, env, spaceId) {
  const body = (await readJson(request)) || {};
  const { name } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await createWorkspace(env, { spaceId, name: name.trim() }), 201);
}

async function handlePatchWorkspace(request, env, id) {
  const existing = await getWorkspaceById(env, id);
  if (!existing) return errorResponse('Workspace not found', 404);
  const body = (await readJson(request)) || {};
  const { name } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await updateWorkspace(env, id, { name: name.trim() }));
}

async function handleWorkspaceReport(env, id) {
  const report = await getWorkspaceReport(env, id);
  if (!report) return errorResponse('Workspace not found', 404);
  return json({ report, narrative: renderReportText(report) });
}

async function handleDeleteWorkspace(env, id) {
  const existing = await getWorkspaceById(env, id);
  if (!existing) return errorResponse('Workspace not found', 404);
  await deleteWorkspace(env, id);
  return json(null, 204);
}

// ---------- Projects ----------

async function handleCreateProject(request, env, spaceId) {
  const body = (await readJson(request)) || {};
  const { name } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await createProject(env, { spaceId, name: name.trim() }), 201);
}

async function handlePatchProject(request, env, id) {
  const existing = await getProjectById(env, id);
  if (!existing) return errorResponse('Project not found', 404);
  const body = (await readJson(request)) || {};
  const { name } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await updateProject(env, id, { name: name.trim() }));
}

async function handleDeleteProject(env, id) {
  const existing = await getProjectById(env, id);
  if (!existing) return errorResponse('Project not found', 404);
  await deleteProject(env, id);
  return json(null, 204);
}

async function handleProjectReport(env, id) {
  const report = await getProjectReport(env, id);
  if (!report) return errorResponse('Project not found', 404);
  return json({ report, narrative: renderReportText(report) });
}

// ---------- Templates ----------

async function handleCreateTemplate(request, env) {
  const body = (await readJson(request)) || {};
  const { name, blockArrangement } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await createTemplate(env, { name: name.trim(), blockArrangement: blockArrangement || [] }), 201);
}

async function handlePatchTemplate(request, env, id) {
  const existing = await getTemplateById(env, id);
  if (!existing) return errorResponse('Template not found', 404);
  const body = (await readJson(request)) || {};
  const { name, blockArrangement } = body;
  if (!name || !name.trim()) return errorResponse('name is required');
  return json(await updateTemplate(env, id, { name: name.trim(), blockArrangement: blockArrangement || [] }));
}

// ---------- Resource Templates ----------

async function handleCreateResourceTemplate(request, env) {
  const body = (await readJson(request)) || {};
  const { type, label, facets } = body;
  if (!type || !type.trim() || !label || !label.trim()) return errorResponse('type and label are required');
  return json(
    await createResourceTemplate(env, { type: type.trim().toLowerCase(), label: label.trim(), facets: facets || [] }),
    201
  );
}

async function handlePatchResourceTemplate(request, env, id) {
  const existing = await getResourceTemplateById(env, id);
  if (!existing) return errorResponse('Resource Template not found', 404);
  const body = (await readJson(request)) || {};
  const { type, label, facets } = body;
  if (!type || !type.trim() || !label || !label.trim()) return errorResponse('type and label are required');
  return json(
    await updateResourceTemplate(env, id, { type: type.trim().toLowerCase(), label: label.trim(), facets: facets || [] })
  );
}

// ---------- Skeleton ----------

async function handleFileLane(request, env, id) {
  const body = (await readJson(request)) || {};
  const { laneKey, text } = body;
  if (!CLAIM_LANE_KEYS.has(laneKey)) return errorResponse('laneKey must be premises, evidence, or open-questions');
  if (!text || !text.trim()) return errorResponse('text is required');
  return json(await fileLineInLane(env, id, laneKey, text.trim()), 201);
}

async function handleCreateTensionPair(request, env, id) {
  const body = (await readJson(request)) || {};
  const { label, statementA, statementB } = body;
  if (!label || !label.trim()) return errorResponse('label is required');
  for (const [name, statement] of [['statementA', statementA], ['statementB', statementB]]) {
    if (!statement || !statement.blockId || !statement.itemId) return errorResponse(`${name} must have a blockId and itemId`);
  }
  return json(await createTensionPair(env, id, { label: label.trim(), statementA, statementB }), 201);
}

// ---------- Router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    let m;

    try {
      if (path === '/api/health' && method === 'GET') return await handleHealth(env);

      // Spaces
      if (path === '/api/spaces' && method === 'GET') return await handleListSpaces(request, env);
      if (path === '/api/spaces' && method === 'POST') return await handleCreateSpace(request, env);
      if (path === '/api/spaces/relational' && method === 'POST') return await handleCreateRelationalSpace(request, env);

      m = path.match(/^\/api\/spaces\/([\w-]+)$/);
      if (m && method === 'GET') return await handleGetSpace(env, m[1]);
      if (m && method === 'PATCH') return await handleUpdateSpace(request, env, m[1]);
      if (m && method === 'DELETE') return await handleDeleteSpace(env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/backlinks$/);
      if (m && method === 'GET') return json(await listBacklinksForSpace(env, m[1]));

      m = path.match(/^\/api\/spaces\/([\w-]+)\/report$/);
      if (m && method === 'GET') return await handleSpaceReport(env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/reviews\/draft$/);
      if (m && method === 'GET') return await handleReviewDraft(env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/reviews$/);
      if (m && method === 'POST') return await handleCreateReview(env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/trail$/);
      if (m && method === 'GET') return json(await listTrailEntries(env, m[1]));
      if (m && method === 'POST') return await handleAddManualTrail(request, env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/trail\/([\w-]+)$/);
      if (m && method === 'PATCH') return await handleUpdateTrailEntry(request, env, m[2]);

      // Skeleton
      m = path.match(/^\/api\/spaces\/([\w-]+)\/skeleton\/file$/);
      if (m && method === 'POST') return await handleFileLane(request, env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/skeleton\/current$/);
      if (m && method === 'GET') return json(await getSkeletonSnapshot(env, m[1]));

      m = path.match(/^\/api\/spaces\/([\w-]+)\/skeleton\/tensions$/);
      if (m && method === 'POST') return await handleCreateTensionPair(request, env, m[1]);

      // Blocks
      m = path.match(/^\/api\/spaces\/([\w-]+)\/blocks$/);
      if (m && method === 'GET') return json(await listBlocksForSpace(env, m[1]));
      if (m && method === 'POST') return await handleAddBlock(request, env, m[1]);

      m = path.match(/^\/api\/spaces\/([\w-]+)\/blocks\/([\w-]+)\/move$/);
      if (m && method === 'POST') return await handleMoveBlock(request, env, m[1], m[2]);

      m = path.match(/^\/api\/blocks\/([\w-]+)$/);
      if (m && method === 'GET') {
        const block = await getBlockByIdWithSpaceTitle(env, m[1]);
        if (!block) return json({ error: 'Entry not found' }, 404);
        return json(block);
      }
      if (m && method === 'PATCH') return await handlePatchBlock(request, env, m[1]);
      if (m && method === 'DELETE') {
        await deleteBlock(env, m[1]);
        return json(null, 204);
      }

      m = path.match(/^\/api\/blocks\/([\w-]+)\/report$/);
      if (m && method === 'GET') return await handleBlockReport(env, m[1]);

      m = path.match(/^\/api\/blocks\/([\w-]+)\/text$/);
      if (m && method === 'PATCH') return await handleSaveTextBlock(request, env, m[1]);

      // Workspaces
      m = path.match(/^\/api\/spaces\/([\w-]+)\/workspaces$/);
      if (m && method === 'GET') return json(await listWorkspacesForSpace(env, m[1]));
      if (m && method === 'POST') return await handleCreateWorkspace(request, env, m[1]);

      m = path.match(/^\/api\/workspaces\/([\w-]+)$/);
      if (m && method === 'GET') {
        const workspace = await getWorkspaceById(env, m[1]);
        if (!workspace) return errorResponse('Workspace not found', 404);
        return json(workspace);
      }
      if (m && method === 'PATCH') return await handlePatchWorkspace(request, env, m[1]);
      if (m && method === 'DELETE') return await handleDeleteWorkspace(env, m[1]);

      m = path.match(/^\/api\/workspaces\/([\w-]+)\/report$/);
      if (m && method === 'GET') return await handleWorkspaceReport(env, m[1]);

      // Projects
      m = path.match(/^\/api\/spaces\/([\w-]+)\/projects$/);
      if (m && method === 'GET') return json(await listProjectsForSpace(env, m[1]));
      if (m && method === 'POST') return await handleCreateProject(request, env, m[1]);

      m = path.match(/^\/api\/projects\/([\w-]+)$/);
      if (m && method === 'GET') {
        const project = await getProjectById(env, m[1]);
        if (!project) return errorResponse('Project not found', 404);
        return json(project);
      }
      if (m && method === 'PATCH') return await handlePatchProject(request, env, m[1]);
      if (m && method === 'DELETE') return await handleDeleteProject(env, m[1]);

      m = path.match(/^\/api\/projects\/([\w-]+)\/report$/);
      if (m && method === 'GET') return await handleProjectReport(env, m[1]);

      // Templates
      if (path === '/api/templates' && method === 'GET') return json(await listTemplates(env));
      if (path === '/api/templates' && method === 'POST') return await handleCreateTemplate(request, env);

      m = path.match(/^\/api\/templates\/([\w-]+)$/);
      if (m && method === 'GET') {
        const template = await getTemplateById(env, m[1]);
        if (!template) return errorResponse('Template not found', 404);
        return json(template);
      }
      if (m && method === 'PATCH') return await handlePatchTemplate(request, env, m[1]);
      if (m && method === 'DELETE') {
        await deleteTemplate(env, m[1]);
        return json(null, 204);
      }

      // Resource Templates
      if (path === '/api/resource-templates' && method === 'GET') {
        const typeParam = url.searchParams.get('type');
        if (typeParam) return json((await getResourceTemplateByType(env, typeParam)) || null);
        return json(await listResourceTemplates(env));
      }
      if (path === '/api/resource-templates' && method === 'POST') return await handleCreateResourceTemplate(request, env);

      m = path.match(/^\/api\/resource-templates\/([\w-]+)$/);
      if (m && method === 'GET') {
        const template = await getResourceTemplateById(env, m[1]);
        if (!template) return errorResponse('Resource Template not found', 404);
        return json(template);
      }
      if (m && method === 'PATCH') return await handlePatchResourceTemplate(request, env, m[1]);
      if (m && method === 'DELETE') {
        await deleteResourceTemplate(env, m[1]);
        return json(null, 204);
      }

      // Work items (cross-Space, for Synthesis's picker)
      if (path === '/api/work-items' && method === 'GET') return json(await listWorkItems(env));
      if (path === '/api/skeleton-claims' && method === 'GET') return json(await listAllSkeletonClaims(env));

      // Insights
      if (path === '/api/insights' && method === 'GET') {
        return json({
          workMix: await getWorkMixInsights(env),
          themes: await getThemeInsights(env),
          activity: await getActivityTrendInsights(env),
          provenance: await getProvenanceInsights(env),
          time: await getTimeInsights(env),
        });
      }

      // Dashboard / cross-Space aggregations
      if (path === '/api/dashboard/overdue-reviews' && method === 'GET') return json(await listOverdueReviews(env));
      if (path === '/api/notifications/count' && method === 'GET') return json({ count: await getNeedsAttentionCount(env) });
      if (path === '/api/dashboard/week' && method === 'GET') return json(await getWeekCalendar(env));
      if (path === '/api/dashboard/resurface' && method === 'GET') return json(await suggestSpaceToResurface(env));
      if (path === '/api/graph' && method === 'GET') return json(await getGraphData(env));
      if (path === '/api/activity' && method === 'GET') {
        return json({ entries: await listGlobalActivity(env), stats: await getActivityStats(env) });
      }

      return errorResponse('not found', 404);
    } catch (err) {
      return errorResponse('internal error: ' + err.message, 500);
    }
  },
};
