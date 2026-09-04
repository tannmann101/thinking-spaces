import { useEffect, useRef } from 'react';

// Closes an overlay on Escape.
//
// All three of this app's overlays (the confirm dialog, the Legend and
// the Export panel) could only be dismissed by clicking -- their close
// buttons and click-outside handlers had no keyboard equivalent, so
// anyone navigating by keyboard could open one and then be stuck in it.
//
// Shared rather than written three times, because three copies of a
// keyboard handler is exactly the kind of thing that gets fixed in two
// places and quietly left broken in the third.
//
// The handler is held in a ref so the listener is registered once rather
// than torn down and re-added on every render. That keeps the hook
// usable with a plain inline arrow at the call site -- otherwise every
// caller would need its own useCallback just to keep this stable, which
// is the kind of ceremony that gets one call site wrong.
export function useEscapeKey(onEscape) {
  const handler = useRef(onEscape);

  // Kept current in an effect rather than assigned during render: an
  // Escape keypress is always a post-commit user event, so there is no
  // window where this could be stale, and assigning during render is
  // the thing React asks you not to do.
  useEffect(() => {
    handler.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    function handle(event) {
      if (event.key === 'Escape') handler.current();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
}
