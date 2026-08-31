// Shared [[spaceId|Title]] wiki-link rendering, used by both the
// ordinary inline TextBlock and the Text Workshop -- one regex, one
// renderer, so linking behaves identically wherever Text appears.

import { Link } from 'react-router-dom';

export const LINK_PATTERN = /\[\[([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g;

export function renderTextWithLinks(text, fromSpaceId) {
  const parts = [];
  let lastIndex = 0;
  let match;
  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const [full, spaceId, title] = match;
    const to = fromSpaceId ? `/spaces/${spaceId}?from=${fromSpaceId}` : `/spaces/${spaceId}`;
    parts.push(
      // stopPropagation so clicking the link navigates instead of also
      // triggering a click-to-edit handler wrapping this text.
      <Link key={match.index} to={to} onClick={(event) => event.stopPropagation()}>
        {title}
      </Link>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
