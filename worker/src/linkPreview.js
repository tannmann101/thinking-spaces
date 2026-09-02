// Pure logic for the "paste a link" side of content ingestion: deciding
// whether a URL is safe to fetch server-side, and pulling a title/
// description/image out of the HTML that comes back. Identical to
// backend/src/linkPreview.js -- no Node-only APIs, so this file is a
// verbatim copy rather than a divergent reimplementation, the same
// "pure JS, ported unchanged" treatment the report-text formatter and
// registry-driven readers already got when they moved to worker/.

// Blocks the classic SSRF targets: loopback, link-local, and every
// RFC1918 private range, plus bare hostnames like "localhost". This is a
// best-effort literal-IP/hostname check, not DNS-rebinding-proof --
// acceptable for a single-user personal app fetching a link the person
// themselves chose to paste in, not a public-facing service.
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1']);

function isPrivateIPv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (isPrivateIPv4(hostname)) return false;
  if (hostname.endsWith('.local')) return false;
  return true;
}

function extractMetaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function resolveMaybeRelativeUrl(url, pageUrl) {
  if (!url) return null;
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return null;
  }
}

// Reads Open Graph tags first (most sites author these deliberately for
// link previews), falling back to <title>/meta description when a site
// has no OG tags at all. Attribute order inside a tag varies by site
// (content before or after property/name), so each field tries both.
export function extractLinkMeta(html, pageUrl) {
  const title = extractMetaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]*)<\/title>/i,
  ]);

  const description = extractMetaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ]);

  const rawImage = extractMetaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
  ]);

  const siteName = extractMetaContent(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i,
  ]);

  return {
    title: title || pageUrl,
    description: description || null,
    image: resolveMaybeRelativeUrl(rawImage, pageUrl),
    siteName: siteName || new URL(pageUrl).hostname,
    url: pageUrl,
  };
}
