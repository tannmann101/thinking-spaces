import { describe, it, expect } from 'vitest';
import { isSafeUrl, extractLinkMeta } from './linkPreview.js';

describe('isSafeUrl', () => {
  it('accepts ordinary http/https URLs', () => {
    expect(isSafeUrl('https://example.com/article')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isSafeUrl('ftp://example.com')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  it('rejects localhost and loopback', () => {
    expect(isSafeUrl('http://localhost:3001/api')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1')).toBe(false);
    expect(isSafeUrl('http://0.0.0.0')).toBe(false);
  });

  it('rejects private IPv4 ranges', () => {
    expect(isSafeUrl('http://10.0.0.5')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1')).toBe(false);
    expect(isSafeUrl('http://172.31.255.255')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1')).toBe(false);
    expect(isSafeUrl('http://169.254.1.1')).toBe(false);
  });

  it('does not reject public IPv4 addresses that merely look similar', () => {
    expect(isSafeUrl('http://172.32.0.1')).toBe(true);
    expect(isSafeUrl('http://8.8.8.8')).toBe(true);
  });

  it('rejects .local hostnames', () => {
    expect(isSafeUrl('http://my-nas.local')).toBe(false);
  });
});

describe('extractLinkMeta', () => {
  it('prefers Open Graph tags when present', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="A Great Article">
        <meta property="og:description" content="Some description here.">
        <meta property="og:image" content="/images/cover.jpg">
        <meta property="og:site_name" content="Example Site">
        <title>Fallback Title</title>
      </head></html>
    `;
    const meta = extractLinkMeta(html, 'https://example.com/article');
    expect(meta.title).toBe('A Great Article');
    expect(meta.description).toBe('Some description here.');
    expect(meta.image).toBe('https://example.com/images/cover.jpg');
    expect(meta.siteName).toBe('Example Site');
    expect(meta.url).toBe('https://example.com/article');
  });

  it('falls back to <title>/meta description when there is no Open Graph data', () => {
    const html = `
      <html><head>
        <title>Plain Page Title</title>
        <meta name="description" content="A plain description.">
      </head></html>
    `;
    const meta = extractLinkMeta(html, 'https://example.com/plain');
    expect(meta.title).toBe('Plain Page Title');
    expect(meta.description).toBe('A plain description.');
    expect(meta.image).toBeNull();
    expect(meta.siteName).toBe('example.com');
  });

  it('falls back to the URL itself when nothing at all is found', () => {
    const meta = extractLinkMeta('<html><head></head></html>', 'https://example.com/bare');
    expect(meta.title).toBe('https://example.com/bare');
    expect(meta.description).toBeNull();
  });

  it('decodes common HTML entities in extracted text', () => {
    const html = `<meta property="og:title" content="Cats &amp; Dogs &quot;Best Friends&quot;">`;
    const meta = extractLinkMeta(html, 'https://example.com/pets');
    expect(meta.title).toBe('Cats & Dogs "Best Friends"');
  });
});
