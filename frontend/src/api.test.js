import { describe, it, expect, vi, afterEach } from 'vitest';
import { getHealth, getSpaces, createSpace, deleteSpace, updateSpace, setMutationListener, getLinkPreview, uploadFile } from './api.js';

// Every exported function in api.js funnels through one private
// request() helper -- these tests exercise that helper's actual
// behavior (success, 204, and error handling) through whichever public
// function is most convenient for each shape, rather than testing each
// of the 40+ exports individually.
function mockFetchOnce(response) {
  global.fetch = vi.fn().mockResolvedValue(response);
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

describe('api.js request()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('prefixes every request path with /api', async () => {
    mockFetchOnce(jsonResponse([]));
    await getSpaces();
    expect(global.fetch).toHaveBeenCalledWith('/api/spaces', expect.any(Object));
  });

  it('sends a JSON Content-Type header by default', async () => {
    mockFetchOnce(jsonResponse([]));
    await getHealth();
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('resolves with the parsed JSON body on success', async () => {
    mockFetchOnce(jsonResponse([{ id: '1', title: 'A Space' }]));
    const result = await getSpaces();
    expect(result).toEqual([{ id: '1', title: 'A Space' }]);
  });

  it('sends the given method and JSON body for a write request', async () => {
    mockFetchOnce(jsonResponse({ id: 'new-id' }));
    await createSpace({ title: 'New Space' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ title: 'New Space' });
  });

  it('resolves with null for a 204 No Content response, without parsing a body', async () => {
    const jsonSpy = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: jsonSpy });
    const result = await deleteSpace('some-id');
    expect(result).toBeNull();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('throws an Error using the server\'s own error message on a non-ok response', async () => {
    mockFetchOnce(jsonResponse({ error: 'Space not found' }, { ok: false, status: 404 }));
    await expect(getSpaces()).rejects.toThrow('Space not found');
  });

  it('falls back to a generic message when the error response has no parseable body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    await expect(getSpaces()).rejects.toThrow('Request to /spaces failed (500)');
  });
});

describe('api.js mutation listener (drives Toast.jsx)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setMutationListener(null);
    vi.restoreAllMocks();
  });

  it('notifies "saved" on a successful PATCH', async () => {
    mockFetchOnce(jsonResponse({}));
    const listener = vi.fn();
    setMutationListener(listener);
    await updateSpace('some-id', { title: 'New title' });
    expect(listener).toHaveBeenCalledWith('saved');
  });

  it('notifies "deleted" on a successful DELETE', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() });
    const listener = vi.fn();
    setMutationListener(listener);
    await deleteSpace('some-id');
    expect(listener).toHaveBeenCalledWith('deleted');
  });

  it('does not notify on a GET or a POST -- only PATCH/DELETE have the "did that save?" gap', async () => {
    mockFetchOnce(jsonResponse([]));
    const listener = vi.fn();
    setMutationListener(listener);
    await getSpaces();
    mockFetchOnce(jsonResponse({ id: 'new-id' }));
    await createSpace({ title: 'New Space' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify when the request fails', async () => {
    mockFetchOnce(jsonResponse({ error: 'nope' }, { ok: false, status: 400 }));
    const listener = vi.fn();
    setMutationListener(listener);
    await expect(updateSpace('some-id', { title: 'x' })).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('api.js getLinkPreview', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('POSTs the url and resolves with the preview fields', async () => {
    mockFetchOnce(jsonResponse({ title: 'A Page', description: null, image: null, siteName: 'example.com', url: 'https://example.com' }));
    const result = await getLinkPreview('https://example.com');
    const [path, options] = global.fetch.mock.calls[0];
    expect(path).toBe('/api/link-preview');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ url: 'https://example.com' });
    expect(result.title).toBe('A Page');
  });

  it('surfaces the server\'s own error message when the link cannot be fetched', async () => {
    mockFetchOnce(jsonResponse({ error: 'That URL cannot be fetched.' }, { ok: false, status: 400 }));
    await expect(getLinkPreview('http://localhost')).rejects.toThrow('That URL cannot be fetched.');
  });
});

describe('api.js uploadFile', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts the file as multipart form data to /api/uploads', async () => {
    mockFetchOnce(jsonResponse({ filename: 'abc.pdf', originalName: 'notes.pdf', mimeType: 'application/pdf', size: 123, url: '/api/uploads/abc.pdf' }));
    const file = new File(['content'], 'notes.pdf', { type: 'application/pdf' });
    const result = await uploadFile(file);
    const [path, options] = global.fetch.mock.calls[0];
    expect(path).toBe('/api/uploads');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(result.url).toBe('/api/uploads/abc.pdf');
  });

  it('throws using the server\'s own error message when the upload is rejected', async () => {
    mockFetchOnce(jsonResponse({ error: 'Unsupported file type.' }, { ok: false, status: 400 }));
    const file = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });
    await expect(uploadFile(file)).rejects.toThrow('Unsupported file type.');
  });
});
