// Every backend call the frontend makes goes through this one file,
// same reasoning as the backend's queries.js: one place to look, not
// fetch() calls scattered through components.

// A save/delete confirmation (see components/Toast.jsx) needs to react
// to a successful mutation from inside this plain fetch wrapper, which
// has no React context of its own -- ToastProvider registers itself
// here on mount instead, the same "a plain module exposes a setter, a
// component calls it" shape as any other event-bus-of-one.
let onMutation = null;
export function setMutationListener(fn) {
  onMutation = fn;
}

async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (${res.status})`);
  }
  // PATCH and DELETE are the two cases with a real "did that actually
  // save?" gap -- almost every edit in this app is click-to-edit-then-
  // blur-to-save with no other feedback. POST is deliberately excluded:
  // creating something is already followed by an obvious change (a new
  // item appears, or the page navigates), so a toast on top would be
  // redundant noise rather than reassurance.
  if (options?.method === 'PATCH') onMutation?.('saved');
  if (options?.method === 'DELETE') onMutation?.('deleted');
  // A 204 (e.g. DELETE) has no body -- calling .json() on it throws.
  if (res.status === 204) return null;
  return res.json();
}

export const getHealth = () => request('/health');
export const getSpaces = () => request('/spaces');
export const getSpacesByTag = (tag) => request(`/spaces?tag=${encodeURIComponent(tag)}`);
export const getSpace = (id) => request(`/spaces/${id}`);
// Creation Mode: templateId, extraBlocks, resourceSpaceIds, tags,
// categories, workspaces, goal, and origin are all optional -- passing
// none of them is still just "start blank," same as before this
// existed. origin ('external'/'internal') is provenance: CreateResource
// passes 'external', CreateSynthesis passes 'internal', ordinary
// Creation Mode leaves it unset.
export const createSpace = ({
  title,
  templateId,
  extraBlocks,
  resourceSpaceIds,
  tags,
  categories,
  workspaces,
  goal,
  origin,
}) =>
  request('/spaces', {
    method: 'POST',
    body: JSON.stringify({
      title,
      templateId,
      extraBlocks,
      resourceSpaceIds,
      tags,
      categories,
      workspaces,
      goal,
      origin,
    }),
  });
// Title, status, tags, and goal ("working toward") all go through this
// one PATCH -- pass only the fields that changed.
export const updateSpace = (id, patch) =>
  request(`/spaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
export const deleteSpace = (id) => request(`/spaces/${id}`, { method: 'DELETE' });
export const getTemplates = () => request('/templates');
export const getBlocksForSpace = (spaceId) => request(`/spaces/${spaceId}/blocks`);
export const getBacklinksForSpace = (spaceId) => request(`/spaces/${spaceId}/backlinks`);
// A structured + prose snapshot of this Space's current state -- see
// getSpaceReport in backend/src/db/queries.js. Fetched lazily, only
// when a Report panel is actually opened (see ReportButton.jsx).
export const getSpaceReport = (spaceId) => request(`/spaces/${spaceId}/report`);
// A Review: what changed since the last one, previewable before it's
// committed permanently to Trail -- see getReviewDraft/createReview in
// backend/src/db/queries.js.
export const getReviewDraft = (spaceId) => request(`/spaces/${spaceId}/reviews/draft`);
export const createReview = (spaceId) => request(`/spaces/${spaceId}/reviews`, { method: 'POST' });
export const updateBlockContent = (blockId, content) =>
  request(`/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
// Text blocks save through this instead of updateBlockContent, so the
// backend can check each line for =/?/! shorthand and promote it into
// the Skeleton before the surviving lines come back. Takes the block's
// whole new `lines` array ({id, text, tag} each), not a single string --
// per-line attribution needs each line's own identity to survive a save.
export const saveTextBlock = (blockId, lines) =>
  request(`/blocks/${blockId}/text`, {
    method: 'PATCH',
    body: JSON.stringify({ lines }),
  });
export const getTrailEntries = (spaceId) => request(`/spaces/${spaceId}/trail`);
export const addTrailNote = (spaceId, note) =>
  request(`/spaces/${spaceId}/trail`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
// Attaches a "why" to an existing (usually auto) entry, or edits a
// manual entry's own note -- entries used to be write-once.
export const updateTrailNote = (spaceId, entryId, note) =>
  request(`/spaces/${spaceId}/trail/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
// The live Skeleton state, in the same {lanes, articulation} shape a
// stored Trail snapshot has -- Rewind's "Now" column reads this.
export const getCurrentSkeleton = (spaceId) => request(`/spaces/${spaceId}/skeleton/current`);
// Cross-Space "Work" items (Assessment/Question, and any future kind)
// -- powers Synthesis's picker, which needs candidates from every
// Space, not just the current one.
export const getWorkItems = () => request('/work-items');
// Cross-Space claim-bearing Skeleton lane items (Premises/Evidence/Open
// Questions) -- powers a Work item's "Link a claim" picker once it can
// point at a claim outside its own Space (see WorkBlock.jsx).
export const getSkeletonClaims = () => request('/skeleton-claims');
// A single block on its own, by id -- used to resolve a cross-Space
// support-point pointer live, without fetching every block in a Space
// this component isn't even viewing (see WorkBlock.jsx).
export const getBlock = (blockId) => request(`/blocks/${blockId}`);
export const getOverdueReviews = () => request('/dashboard/overdue-reviews');
// The Dashboard's Week calendar: one entry per day of the current
// calendar week (Sunday-Saturday), each carrying that day's Trail
// activity and whatever is due that day (Space due dates, Milestone
// target dates) -- see getWeekCalendar in backend/src/db/queries/dashboard.js.
export const getWeekCalendar = () => request('/dashboard/week');
export const getResurfaceSuggestion = () => request('/dashboard/resurface');
// The sidebar's "needs attention" badge -- fetched on every page.
export const getNotificationCount = () => request('/notifications/count');
// Everything InsightsPage.jsx needs in one call -- work mix, themes/
// tensions, activity trend, and provenance/synthesis yield, all
// computed across every Space at once.
export const getInsights = () => request('/insights');

// Template management.
export const getTemplate = (id) => request(`/templates/${id}`);
export const createTemplate = ({ name, blockArrangement }) =>
  request('/templates', {
    method: 'POST',
    body: JSON.stringify({ name, blockArrangement }),
  });
export const updateTemplate = (id, { name, blockArrangement }) =>
  request(`/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, blockArrangement }),
  });
export const deleteTemplate = (id) => request(`/templates/${id}`, { method: 'DELETE' });

// Resource Template management -- a deliberately separate mechanism
// from ordinary Templates above (see backend/src/db/schema.sql). Each
// replaces CreateResource.jsx's generic descriptive facets with a
// type-tailored set of its own.
export const getResourceTemplates = () => request('/resource-templates');
// null when no Resource Template matches this type -- CreateResource.jsx
// falls back to its own generic facets in that case.
export const getResourceTemplateByType = (type) => request(`/resource-templates?type=${encodeURIComponent(type)}`);
export const getResourceTemplate = (id) => request(`/resource-templates/${id}`);
export const createResourceTemplate = ({ type, label, facets }) =>
  request('/resource-templates', {
    method: 'POST',
    body: JSON.stringify({ type, label, facets }),
  });
export const updateResourceTemplate = (id, { type, label, facets }) =>
  request(`/resource-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ type, label, facets }),
  });
export const deleteResourceTemplate = (id) => request(`/resource-templates/${id}`, { method: 'DELETE' });

// Adding/removing/reordering blocks on an already-live Space.
export const addBlockToSpace = (spaceId, { type, content, properties }) =>
  request(`/spaces/${spaceId}/blocks`, {
    method: 'POST',
    body: JSON.stringify({ type, content, properties }),
  });
export const deleteBlockApi = (blockId) => request(`/blocks/${blockId}`, { method: 'DELETE' });
// A structured + prose snapshot of this one block's current state --
// see getBlockReport in backend/src/db/queries.js. Works for every
// Block type, a Work item (e.g. a Hypothesis) included.
export const getBlockReport = (blockId) => request(`/blocks/${blockId}/report`);
// Which of the Space's own Categories a block belongs to (many-to-many).
export const updateBlockCategories = (blockId, categories) =>
  request(`/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ categories }),
  });
// Which Workspaces a block has been assembled into (many-to-many).
export const updateBlockWorkspaces = (blockId, workspaces) =>
  request(`/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ workspaces }),
  });
// Which Project (see below) a Milestone/Session belongs to -- a single
// id, not an array; pass null to clear it.
export const updateBlockProject = (blockId, projectId) =>
  request(`/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ projectId }),
  });
export const moveBlockInSpace = (spaceId, blockId, direction) =>
  request(`/spaces/${spaceId}/blocks/${blockId}/move`, {
    method: 'POST',
    body: JSON.stringify({ direction }),
  });

// Workspaces: a deliberately assembled, named environment inside one
// Space (see backend/src/db/queries.js, "--- Workspaces ---").
export const getWorkspacesForSpace = (spaceId) => request(`/spaces/${spaceId}/workspaces`);
export const getWorkspace = (id) => request(`/workspaces/${id}`);
export const createWorkspace = (spaceId, name) =>
  request(`/spaces/${spaceId}/workspaces`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
export const renameWorkspace = (id, name) =>
  request(`/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
export const deleteWorkspace = (id) => request(`/workspaces/${id}`, { method: 'DELETE' });
// A structured + prose snapshot of this Workspace's current state --
// see getWorkspaceReport in backend/src/db/queries.js.
export const getWorkspaceReport = (workspaceId) => request(`/workspaces/${workspaceId}/report`);

// Projects: a real, named goal/project inside one Space that a
// Milestone or Session belongs to (see backend/src/db/queries.js,
// "--- Projects ---"). Named "Project" rather than "Goal" to avoid
// colliding with a Space's own pre-existing `goal` field.
export const getProjectsForSpace = (spaceId) => request(`/spaces/${spaceId}/projects`);
export const getProject = (id) => request(`/projects/${id}`);
export const createProject = (spaceId, name) =>
  request(`/spaces/${spaceId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
export const renameProject = (id, name) =>
  request(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
export const deleteProject = (id) => request(`/projects/${id}`, { method: 'DELETE' });
// A structured + prose snapshot of this Project's current state --
// see getProjectReport in backend/src/db/queries.js.
export const getProjectReport = (projectId) => request(`/projects/${projectId}/report`);

// The Skeleton's alternate capture path: copy an already-written line
// into a lane, leaving the Writing Surface untouched (see fileLineInLane
// in backend/src/db/queries.js -- deliberately not a promotion).
export const fileLineInLane = (spaceId, laneKey, text) =>
  request(`/spaces/${spaceId}/skeleton/file`, {
    method: 'POST',
    body: JSON.stringify({ laneKey, text }),
  });
// A Tension paired explicitly between two specific existing statements
// (each {blockId, itemId}), never inferred.
export const createTensionPair = (spaceId, { label, statementA, statementB }) =>
  request(`/spaces/${spaceId}/skeleton/tensions`, {
    method: 'POST',
    body: JSON.stringify({ label, statementA, statementB }),
  });

// The Graph view (Pass 5): every Reference block across every Space.
export const getGraph = () => request('/graph');

// The Log: every structural lifecycle event plus the Trail, merged.
export const getActivity = () => request('/activity');
export const createRelationalSpace = ({ title, spaceIds }) =>
  request('/spaces/relational', {
    method: 'POST',
    body: JSON.stringify({ title, spaceIds }),
  });

// Content ingestion (see CLAUDE.md): fetches a URL server-side (the
// browser can't read another site's HTML directly, since that page's own
// CORS headers block it) and returns its Open Graph/meta-tag fields, used
// by CreateResource.jsx to build a 'link' Media block without ever
// storing the page's own HTML.
export const getLinkPreview = (url) =>
  request('/link-preview', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

// File upload bypasses request()'s own JSON Content-Type header --
// multipart form data sets its own boundary-carrying Content-Type, which
// fetch only gets right when it's left unset and FormData is passed
// directly as the body. Not wired through the shared onMutation listener
// either, for the same reason POST already isn't: a successful upload is
// followed by a Resource being created, an obvious enough change on its
// own. Returns { filename, originalName, mimeType, size, url }.
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return res.json();
}
