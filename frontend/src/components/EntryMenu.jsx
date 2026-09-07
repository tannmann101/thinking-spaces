import { useEffect, useRef } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey.js';

// Everything you can *do* to one entry, behind one control.
//
// These used to sit open on every entry, in two rows: Report, Theme,
// Move up, Move down, Move to..., Remove. Six controls wrapped around
// content that is often a single line -- measured at ~160px of row for
// ~20px of writing. Dimming them (see the design pass) made them
// recede without making them fewer.
//
// The Dev Mode rule still holds: nothing here is behind a *mode*, and
// nothing became less editable. It is one click, on the entry itself,
// with everything still in place -- the same shape a Category chip
// picker or the Theme picker already had.
//
// A native <details> on purpose: no open/closed state to manage, and it
// is focusable and toggleable from the keyboard for free. Two things it
// does *not* do on its own, both added below: close when you click
// elsewhere, and close on Escape -- that last one is worth naming,
// because it is easy to assume <details> behaves like <dialog> here and
// it doesn't. Caught by pressing the key rather than by reading.
function EntryMenu({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      const el = ref.current;
      if (el?.open && !el.contains(event.target)) el.open = false;
    }
    document.addEventListener('click', closeOnOutsideClick);
    return () => document.removeEventListener('click', closeOnOutsideClick);
  }, []);

  useEscapeKey(() => {
    if (ref.current?.open) ref.current.open = false;
  });

  return (
    <details className="entry-menu" ref={ref}>
      <summary className="entry-menu-toggle" aria-label="Actions for this entry" title="Actions for this entry">
        ⋯
      </summary>
      {/* Closes as soon as something inside is chosen, so the menu never
          lingers over the change it just made. */}
      <div className="entry-menu-items" onClick={() => { if (ref.current) ref.current.open = false; }}>
        {children}
      </div>
    </details>
  );
}

export default EntryMenu;
