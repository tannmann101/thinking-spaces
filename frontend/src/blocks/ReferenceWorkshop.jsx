// The Reference Workshop: what a Reference block becomes inside a
// Workspace, instead of the single terse line it is in the ordinary
// feed (see ReferenceBlock.jsx). Same underlying data and save path
// (updateBlockContent) -- what's new is the environment: a real,
// auto-growing note surface instead of a single-line input, the trust
// rating as a clear chip row instead of a single click-to-cycle label,
// and a live preview card of the target Space itself (its status, tags,
// Categories, and "working toward" goal) fetched fresh -- so "what this
// touches" actually shows you something about what it touches, not just
// a name to click through to.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpace, updateBlockContent } from '../api.js';

const TRUST_LEVELS = [
  { value: null, label: 'unrated' },
  { value: 'high', label: 'high' },
  { value: 'medium', label: 'medium' },
  { value: 'low', label: 'low' },
];

function ReferenceWorkshop({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const { target_space_id, targetSpaceTitle } = block.content;
  const [savedNote, setSavedNote] = useState(block.content.note || '');
  const [draft, setDraft] = useState(savedNote);
  const [trust, setTrust] = useState(block.content.trust || null);
  const [targetSpace, setTargetSpace] = useState(null);
  const [targetError, setTargetError] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    getSpace(target_space_id)
      .then(setTargetSpace)
      .catch((err) => setTargetError(err.message));
  }, [target_space_id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function persist(newNote, newTrust) {
    await updateBlockContent(block.id, { target_space_id, note: newNote || null, trust: newTrust || null });
    onBlocksChanged?.();
  }

  function handleBlur() {
    if (draft === savedNote) return;
    setSavedNote(draft);
    persist(draft, trust);
  }

  function setTrustLevel(value) {
    if (!editable) return;
    setTrust(value);
    persist(savedNote, value);
  }

  const to = block.space_id ? `/spaces/${target_space_id}?from=${block.space_id}` : `/spaces/${target_space_id}`;

  return (
    <div className="reference-workshop">
      <p className="reference-workshop-target">
        <span className="ref-arrow">→</span>
        <Link to={to}>{targetSpaceTitle || target_space_id}</Link>
      </p>

      <textarea
        ref={textareaRef}
        className="reference-workshop-note"
        value={draft}
        placeholder="Why does this connect? (optional)"
        disabled={!editable}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
      />

      <p className="reference-workshop-trust-row">
        Source trust:{' '}
        {TRUST_LEVELS.map(({ value, label }) => (
          <span
            key={label}
            className={`category-chip category-chip-toggle${trust === value ? ' category-chip-active' : ''}`}
            onClick={() => setTrustLevel(value)}
          >
            {label}
          </span>
        ))}
      </p>

      <div className="reference-workshop-preview">
        {targetError && <p>Could not load the target Space: {targetError}</p>}
        {!targetError && !targetSpace && <p>Loading target Space...</p>}
        {targetSpace && (
          <>
            <p className="reference-workshop-preview-label">What it touches</p>
            <p className="reference-workshop-preview-title">
              <Link to={to}>{targetSpace.title}</Link>{' '}
              <span className="status-pill" data-status={targetSpace.status}>
                {targetSpace.status}
              </span>
            </p>
            {targetSpace.goal && <p className="working-toward">Working toward: {targetSpace.goal}</p>}
            {targetSpace.categories.length > 0 && (
              <p className="category-row">
                {targetSpace.categories.map((category) => (
                  <span key={category} className="category-chip">
                    {category}
                  </span>
                ))}
              </p>
            )}
            {targetSpace.tags.length > 0 && (
              <p className="tag-row">
                {targetSpace.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReferenceWorkshop;
