import { useEffect } from 'react';

// The browser tab title was hardcoded to "Thinking Spaces" in
// index.html and never updated per route -- with several tabs open,
// every one of them looked identical from the tab bar, with no way to
// tell which was the Dashboard, which was a specific Space, which was
// the Log. Each page calls this with its own name once it knows it
// (a static string for a fixed page like "Tools", the Space's own
// title once it's loaded) to set a distinguishable tab title instead.
// No cleanup on unmount needed: the next page's own call overwrites it
// the moment it mounts, same as any other per-route page title would.
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Thinking Spaces` : 'Thinking Spaces';
  }, [title]);
}
