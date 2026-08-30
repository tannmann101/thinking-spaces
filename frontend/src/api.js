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
