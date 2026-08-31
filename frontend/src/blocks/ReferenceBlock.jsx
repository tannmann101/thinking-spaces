// Renders one Reference block: a link to another Space, with an
// optional, editable note. The backend attaches targetSpaceTitle so
// this doesn't need its own fetch just to show the target's name.
//
// Only the note is editable -- re-pointing target_space_id to a
// different Space is a bigger feature (effectively "delete and
// recreate this link") and isn't asked for here.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateBlockContent } from '../api.js';

// onSave lets a parent block (Comparison) override where an edit goes,
// same reasoning as TextBlock. onBlocksChanged tells SpacePage to
// refetch after a standalone save, so anything else on the page
// depending on this Space's data doesn't stay stale.
function ReferenceBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { target_space_id, targetSpaceTitle } = block.content;

  const [editing, setEditing] = useState(false);
  const [savedNote, setSavedNote] = useState(block.content.note || '');
  const [draft, setDraft] = useState(savedNote);

  async function finishEditing() {
    setEditing(false);
    if (draft === savedNote) return;
    setSavedNote(draft);
    const newContent = { target_space_id, note: draft || null };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  const to = block.space_id
    ? `/spaces/${target_space_id}?from=${block.space_id}`
    : `/spaces/${target_space_id}`;

  return (
    <p>
      →{' '}
      <Link to={to} onClick={(event) => event.stopPropagation()}>
        {targetSpaceTitle || target_space_id}
      </Link>{' '}
      {editing ? (
        <input
          type="text"
          value={draft}
          autoFocus
          style={{ width: '55%', fontFamily: 'inherit', fontSize: 'inherit' }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishEditing}
          onKeyDown={(event) => event.key === 'Enter' && finishEditing()}
        />
      ) : (
        <span
          className={editable ? 'editable' : undefined}
          onClick={() => editable && setEditing(true)}
        >
          {savedNote ? `— ${savedNote}` : editable ? '(add a note)' : ''}
        </span>
      )}
    </p>
  );
}

export default ReferenceBlock;
