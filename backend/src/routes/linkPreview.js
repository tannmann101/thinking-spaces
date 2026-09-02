// POST /link-preview -- fetches a URL server-side (avoiding the browser's
// own CORS restrictions, which block reading another site's HTML directly
// from the frontend) and pulls a title/description/image out of it via
// linkPreview.js's pure parsing functions. Store & view only: nothing here
// is persisted -- the frontend calls this once, at the moment a link is
// pasted into CreateResource.jsx, and saves the returned preview fields
// straight into a Media block's own content.

import express from 'express';
import { isSafeUrl, extractLinkMeta } from '../linkPreview.js';

export const linkPreviewRouter = express.Router();

linkPreviewRouter.post('/link-preview', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  if (!isSafeUrl(url)) {
    return res.status(400).json({ error: 'That URL cannot be fetched.' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThinkingSpacesBot/1.0)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!response.ok) {
      return res.status(502).json({ error: `The page returned ${response.status}.` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.status(502).json({ error: 'That link does not point to a web page.' });
    }
    const html = await response.text();
    const meta = extractLinkMeta(html, response.url || url);
    res.json(meta);
  } catch (err) {
    res.status(502).json({ error: `Could not fetch that link: ${err.message}` });
  }
});
