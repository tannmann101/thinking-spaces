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
// categories, and goal are all optional -- passing none of them is
// still just "start blank," same as before this existed.
export const createSpace = ({
  title,
  templateId,
  extraBlocks,
  resourceSpaceIds,
  tags,
  categories,
  goal,
}) =>
  request('/spaces', {
    method: 'POST',
    body: JSON.stringify({ title, templateId, extraBlocks, resourceSpaceIds, tags, categories, goal }),
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
export const updateBlockContent = (blockId, content) =>
  request(`/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
// Text blocks save through this instead of updateBlockContent, so the
// backend can check for =/?/! shorthand and promote it into the
// Skeleton before the trimmed text comes back.
export const saveTextBlock = (blockId, text) =>
  request(`/blocks/${blockId}/text`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  });
export const getTrailEntries = (spaceId) => request(`/spaces/${spaceId}/trail`);
export const addTrailNote = (spaceId, note) =>
  request(`/spaces/${spaceId}/trail`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
export const getOverdueReviews = () => request('/dashboard/overdue-reviews');
export const getRecentTrail = () => request('/dashboard/recent-trail');
export const getResurfaceSuggestion = () => request('/dashboard/resurface');

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

// The Graph view (Pass 5): every Reference block across every Space.
export const getGraph = () => request('/graph');

// The Log: every structural lifecycle event plus the Trail, merged.
export const getActivity = () => request('/activity');
export const createRelationalSpace = ({ title, spaceIds }) =>
  request('/spaces/relational', {
    method: 'POST',
    body: JSON.stringify({ title, spaceIds }),
  });
