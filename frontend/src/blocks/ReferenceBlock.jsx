// Renders one Reference block: a link to another Space, with an
// optional, editable note, and an optional trust rating for the
// source it points at -- separate from an item's own confidence
// (which is about how solid a claim is), this is about how much the
// *source* itself is trusted.
//
// Only the note and trust are editable -- re-pointing target_space_id
// to a different Space is a bigger feature (effectively "delete and
// recreate this link") and isn't asked for here.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateBlockContent } from '../api.js';

const TRUST_CYCLE = [null, 'high', 'medium', 'low'];

// onSave lets a parent override where an edit goes -- a Comparison side,
// or the Tools catalog's own interactive demo (see ToolsPage.jsx's
// DemoBlock) -- same reasoning as TextBlock. onBlocksChanged tells
// SpacePage to refetch after a standalone save, so anything else on the
// page depending on this Space's data doesn't stay stale.
function ReferenceBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { target_space_id, targetSpaceTitle } = block.content;

  const [editing, setEditing] = useState(false);
  const [savedNote, setSavedNote] = useState(block.content.note || '');
  const [draft, setDraft] = useState(savedNote);
  const [trust, setTrust] = useState(block.content.trust || null);

  async function persist(newNote, newTrust) {
    const newContent = { target_space_id, note: newNote || null, trust: newTrust || null };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  async function finishEditing() {
    setEditing(false);
    if (draft === savedNote) return;
    setSavedNote(draft);
    await persist(draft, trust);
  }

  async function cycleTrust() {
    if (!editable) return;
    const next = TRUST_CYCLE[(TRUST_CYCLE.indexOf(trust) + 1) % TRUST_CYCLE.length];
    setTrust(next);
    await persist(savedNote, next);
  }

  const to = block.space_id
    ? `/spaces/${target_space_id}?from=${block.space_id}`
    : `/spaces/${target_space_id}`;

  return (
    <p className="reference-block">
      <span className="ref-arrow">→</span>
      <Link to={to} onClick={(event) => event.stopPropagation()}>
        {targetSpaceTitle || target_space_id}
      </Link>{' '}
      {editing ? (
        <input
          type="text"
          value={draft}
          autoFocus
          className="field-width-55 field-inherit-font"
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
      )}{' '}
      {editable && (
        <span
          className="editable-toggle"
          onClick={cycleTrust}
          title="Click to cycle: unrated -> high -> medium -> low trust in this source"
        >
          [source trust: {trust || 'unrated'}]
        </span>
      )}
    </p>
  );
}

export default ReferenceBlock;
