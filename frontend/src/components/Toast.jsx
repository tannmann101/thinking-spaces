// A small, self-dismissing confirmation for a save, create, or delete --
// the gap the interaction-design pass found: almost every edit in this
// app is click-to-edit-then-blur-to-save with nothing else confirming it
// actually took. Mounted once at the app root (see App.jsx), the same
// way ConfirmDialogProvider is; unlike that one, nothing calls this
// directly -- it registers itself with api.js's mutation listener
// (setMutationListener) and reacts to every successful PATCH/POST/DELETE
// automatically, so no page or component needed to change to get one.
//
// The message itself is content-aware, not a generic "Saved" -- api.js
// passes through whichever changeSummary the backend computed (a
// Milestone reached, a Space becoming overdue, a Skeleton promotion,
// ...), falling back to a plain "Saved"/"Deleted" only when there's
// nothing more specific to say. See CLAUDE.md's cohesion-pass entry for
// why this replaced the earlier kind-only version.
//
// One slot, not a stack: a second mutation while a toast is already
// showing just resets its own dismiss timer rather than queuing a
// second bubble, since several ordinary actions (checking off a few
// List items in a row) fire more than one PATCH in quick succession --
// stacking toasts for that would read as noise, not reassurance.

import { useEffect, useRef, useState } from 'react';
import { setMutationListener } from '../api.js';

const VISIBLE_MS = 3200;

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setMutationListener((nextMessage) => {
      clearTimeout(timeoutRef.current);
      setMessage(nextMessage);
      timeoutRef.current = setTimeout(() => setMessage(null), VISIBLE_MS);
    });
    return () => {
      setMutationListener(null);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {children}
      <div className={`toast${message ? ' toast-visible' : ''}`} role="status" aria-live="polite">
        {message || ''}
      </div>
    </>
  );
}
