// A themed replacement for window.confirm/window.prompt -- the app's
// only two calls out to native browser chrome, which read as jarring
// and unstyled against the rest of the custom dark theme. Mounted once
// at the app root (see App.jsx); any page calls the two exported hooks
// below instead of the native functions, awaiting a Promise the same
// way the native calls returned synchronously.
//
// Two kinds, matching the two ways the app actually used the native
// dialogs: `confirm(message)` is a plain yes/no (mirrors
// window.confirm); `promptToMatch(message, matchText)` requires typing
// the given text back exactly before the destructive action enables --
// the same "type the Space's name to confirm" pattern already used for
// deleting a Space, just themed and generalized rather than duplicated
// per call site.

import { createContext, useCallback, useContext, useState } from 'react';

const ConfirmDialogContext = createContext(null);

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
  }
  return context;
}

export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [draft, setDraft] = useState('');

  const confirm = useCallback(
    (message) => new Promise((resolve) => setDialog({ kind: 'confirm', message, resolve })),
    []
  );

  const promptToMatch = useCallback(
    (message, matchText) =>
      new Promise((resolve) => {
        setDraft('');
        setDialog({ kind: 'prompt', message, matchText, resolve });
      }),
    []
  );

  function close(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  const promptMatches = dialog?.kind === 'prompt' && draft === dialog.matchText;

  return (
    <ConfirmDialogContext.Provider value={{ confirm, promptToMatch }}>
      {children}
      {dialog && (
        <div className="confirm-overlay" onClick={() => close(false)}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <p className="confirm-message">{dialog.message}</p>
            {dialog.kind === 'prompt' && (
              <input
                type="text"
                autoFocus
                value={draft}
                placeholder={`Type "${dialog.matchText}" to confirm`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && promptMatches && close(true)}
              />
            )}
            <p className="confirm-actions">
              <button type="button" className="btn-ghost-small" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                autoFocus={dialog.kind === 'confirm'}
                disabled={dialog.kind === 'prompt' && !promptMatches}
                onClick={() => close(dialog.kind === 'prompt' ? promptMatches : true)}
              >
                {dialog.kind === 'prompt' ? 'Delete' : 'Confirm'}
              </button>
            </p>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}
