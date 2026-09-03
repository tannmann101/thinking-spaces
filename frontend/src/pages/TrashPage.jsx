// Recently deleted: what a delete removed, and putting it back.
//
// Nothing here expires on its own -- there's no background job in this
// app to run an expiry in, and quietly destroying something a second
// time is exactly what this page exists to prevent. Emptying the trash
// is a deliberate act, and the only genuinely permanent one, so it goes
// through the themed confirm dialog.

import { useCallback, useEffect, useState } from 'react';
import { getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from '../api.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// What each snapshotted kind is called on screen. The backend stores the
// bare kind key; the reading of it belongs here, same split as
// Workspace Kinds.
const KIND_LABELS = {
  space: 'Space',
  block: 'Entry',
  workspace: 'Workspace',
  project: 'Project',
  template: 'Template',
  resource_template: 'Resource Template',
};

function TrashPage() {
  usePageTitle('Recently deleted');
  const { confirm } = useConfirmDialog();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    getTrash()
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(refetch, [refetch]);

  async function handleRestore(entry) {
    await restoreFromTrash(entry.id);
    refetch();
  }

  async function handlePurge(entry) {
    const ok = await confirm(
      `Permanently delete "${entry.label}"? This is the one action here that can't be undone.`
    );
    if (!ok) return;
    await purgeTrashEntry(entry.id);
    refetch();
  }

  async function handleEmpty() {
    const ok = await confirm(
      `Permanently delete all ${entries.length} items in the trash? This can't be undone.`
    );
    if (!ok) return;
    await emptyTrash();
    refetch();
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <h1>Recently deleted</h1>
        <p>
          Everything you&rsquo;ve deleted, kept so you can put it back. Restoring a Space brings its entries,
          Workspaces, Projects and Trail back with it. Nothing here disappears on its own &mdash; it stays
          until you empty it.
        </p>

        {error && <p>Could not load the trash: {error}</p>}
        {!error && !entries && <p>Loading...</p>}

        {entries && entries.length === 0 && (
          <p className="empty-note">Nothing deleted. Anything you remove will wait here.</p>
        )}

        {entries && entries.length > 0 && (
          <>
            <ul className="trash-list">
              {entries.map((entry) => (
                <li key={entry.id} className="trash-row">
                  <span className="trash-label">{entry.label}</span>
                  <span className="trash-meta">
                    {KIND_LABELS[entry.kind] || entry.kind}
                    {entry.context ? ` · from ${entry.context}` : ''} · deleted {entry.deleted_at}
                  </span>
                  <span className="trash-actions">
                    <button type="button" className="btn-ghost-small" onClick={() => handleRestore(entry)}>
                      Restore
                    </button>
                    <button type="button" className="btn-ghost-small" onClick={() => handlePurge(entry)}>
                      Delete permanently
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <p className="danger-zone">
              <button type="button" className="btn-danger" onClick={handleEmpty}>
                Empty the trash
              </button>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default TrashPage;
