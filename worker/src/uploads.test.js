import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from './index.js';

// Runs against Miniflare's real emulated R2 bucket (bound as UPLOADS in
// wrangler.toml), not a mock -- so these exercise the actual
// env.UPLOADS.put()/.get() calls the deployed Worker makes, the same
// rigor the D1 tests give the database layer.

async function clearBucket() {
  const listed = await env.UPLOADS.list();
  for (const object of listed.objects) await env.UPLOADS.delete(object.key);
}

function uploadRequest(file, fieldName = 'file') {
  const form = new FormData();
  form.append(fieldName, file);
  return new Request('http://x/api/uploads', { method: 'POST', body: form });
}

const call = (request) => worker.fetch(request, env);

beforeEach(async () => {
  await clearBucket();
});

describe('POST /api/uploads', () => {
  it('stores a file and returns the shape the frontend expects', async () => {
    const file = new File(['hello from a real upload'], 'notes.txt', { type: 'text/plain' });
    const body = await (await call(uploadRequest(file))).json();

    expect(body.originalName).toBe('notes.txt');
    expect(body.mimeType).toBe('text/plain');
    expect(body.size).toBe(24);
    // The stored name is generated, never the name the person picked.
    expect(body.filename).not.toContain('notes');
    expect(body.filename).toMatch(/^[0-9a-f-]{36}\.txt$/);
    expect(body.url).toBe(`/api/uploads/${body.filename}`);
  });

  it('round-trips the bytes exactly', async () => {
    const contents = 'line one\nline two\n';
    const file = new File([contents], 'notes.md', { type: 'text/markdown' });
    const { url } = await (await call(uploadRequest(file))).json();

    const served = await call(new Request(`http://x${url}`));
    expect(served.status).toBe(200);
    expect(await served.text()).toBe(contents);
  });

  it('serves it back with the content type it was stored under', async () => {
    const file = new File(['%PDF-1.4 fake'], 'paper.pdf', { type: 'application/pdf' });
    const { url } = await (await call(uploadRequest(file))).json();

    const served = await call(new Request(`http://x${url}`));
    expect(served.headers.get('content-type')).toBe('application/pdf');
  });

  it('accepts markdown with no mimetype at all, via the extension fallback', async () => {
    // Browsers and operating systems disagree about markdown's type, and
    // some send nothing -- which is why the fallback exists.
    const file = new File(['# heading'], 'notes.md', { type: '' });
    expect((await call(uploadRequest(file))).status).toBe(200);
  });

  it('rejects a file type that is not on the allowlist', async () => {
    const file = new File(['MZ'], 'thing.exe', { type: 'application/x-msdownload' });
    const response = await call(uploadRequest(file));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Unsupported file type.');
    expect((await env.UPLOADS.list()).objects).toHaveLength(0);
  });

  it('rejects a file over the size limit without storing it', async () => {
    const tooBig = new File(['x'.repeat(26 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });
    const response = await call(uploadRequest(tooBig));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('too large');
    expect((await env.UPLOADS.list()).objects).toHaveLength(0);
  });

  it('rejects a request with no file in it', async () => {
    const response = await call(uploadRequest(new File(['x'], 'a.txt', { type: 'text/plain' }), 'notfile'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('No file was uploaded.');
  });

  it('rejects a plain text field masquerading as the file', async () => {
    const form = new FormData();
    form.append('file', 'just a string, not a file');
    const response = await call(new Request('http://x/api/uploads', { method: 'POST', body: form }));
    expect(response.status).toBe(400);
  });

  it('rejects a body that is not a multipart form', async () => {
    const response = await call(
      new Request('http://x/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"file":"nope"}',
      })
    );
    expect(response.status).toBe(400);
  });
});

describe('GET /api/uploads/:filename', () => {
  it('404s for a file that was never stored', async () => {
    const response = await call(new Request('http://x/api/uploads/11111111-2222-3333-4444-555555555555.pdf'));
    expect(response.status).toBe(404);
  });

  // On R2 a crafted name is a different key rather than a path escape,
  // but the rule is still "only ever serve back something this app could
  // have written" -- so a name that isn't UUID-shaped never reaches
  // storage at all.
  it('refuses a filename this app could not have generated', async () => {
    await env.UPLOADS.put('secrets.txt', 'do not serve me');
    const response = await call(new Request('http://x/api/uploads/secrets.txt'));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('do not serve me');
  });

  it('refuses a traversal-shaped filename', async () => {
    const response = await call(new Request('http://x/api/uploads/..%2F..%2Fpackage.json'));
    expect(response.status).toBe(404);
  });
});
