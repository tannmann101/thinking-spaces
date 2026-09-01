// A small, self-dismissing confirmation for a save or delete -- the
// gap the interaction-design pass found: almost every edit in this app
// is click-to-edit-then-blur-to-save with nothing else confirming it
// actually took. Mounted once at the app root (see App.jsx), the same
// way ConfirmDialogProvider is; unlike that one, nothing calls this
// directly -- it registers itself with api.js's mutation listener
// (setMutationListener) and reacts to every successful PATCH/DELETE
// automatically, so no page or component needed to change to get one.
//
// One slot, not a stack: a second mutation while a toast is already
// showing just resets its own dismiss timer rather than queuing a
// second bubble, since several ordinary actions (checking off a few
// List items in a row) fire more than one PATCH in quick succession --
// stacking toasts for that would read as noise, not reassurance.

import { useEffect, useRef, useState } from 'react';
import { setMutationListener } from '../api.js';

const VISIBLE_MS = 2000;

const MESSAGES = {
  saved: 'Saved',
  deleted: 'Deleted',
};

export function ToastProvider({ children }) {
  const [kind, setKind] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setMutationListener((nextKind) => {
      clearTimeout(timeoutRef.current);
      setKind(nextKind);
      timeoutRef.current = setTimeout(() => setKind(null), VISIBLE_MS);
    });
    return () => {
      setMutationListener(null);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {children}
      <div className={`toast${kind ? ' toast-visible' : ''}`} role="status" aria-live="polite">
        {kind ? MESSAGES[kind] : ''}
      </div>
    </>
  );
}
