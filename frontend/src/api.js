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
export const getSpace = (id) => request(`/spaces/${id}`);
export const createSpace = ({ title, templateId }) =>
  request('/spaces', {
    method: 'POST',
    body: JSON.stringify({ title, templateId }),
  });
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
export const moveBlockInSpace = (spaceId, blockId, direction) =>
  request(`/spaces/${spaceId}/blocks/${blockId}/move`, {
    method: 'POST',
    body: JSON.stringify({ direction }),
  });
