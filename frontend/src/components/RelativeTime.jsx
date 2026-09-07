import { formatRelative, formatAbsolute, toDateTimeAttribute } from '../lib/formatTime.js';

// One <time> element, rendered the same way everywhere a timestamp shows.
//
// Reads as the phrasing a person would use ("yesterday"), carries the
// exact moment in its tooltip, and puts the machine-readable form in
// dateTime -- so choosing the readable wording costs nothing. Shared
// rather than repeated at each call site so the tooltip's own format
// can't drift between pages, the same reason textLinks.jsx and
// listItems.js exist.
export default function RelativeTime({ value, className }) {
  const text = formatRelative(value);
  if (!text) return null;
  return (
    <time className={className} dateTime={toDateTimeAttribute(value)} title={formatAbsolute(value)}>
      {text}
    </time>
  );
}
