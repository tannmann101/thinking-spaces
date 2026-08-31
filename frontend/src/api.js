// Every backend call the frontend makes goes through this one file,
// same reasoning as the backend's queries.js: one place to look, not
// fetch() calls scattered through components.

async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (${res.status})`);
  }
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
export const getOverdueReviews = () => request('/dashboard/overdue-reviews');
export const getRecentTrail = () => request('/dashboard/recent-trail');
export const getResurfaceSuggestion = () => request('/dashboard/resurface');
// Everything InsightsPage.jsx needs in one call -- work mix, themes/
// tensions, activity trend, and provenance/synthesis yield, all
// computed across every Space at once.
export const getInsights = () => request('/insights');

// Template management (Pass 4 / "Dev Mode").
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
