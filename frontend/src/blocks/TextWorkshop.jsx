// The Text Workshop: what a Text block becomes inside a Workspace,
// instead of the small click-to-edit paragraph it is in the ordinary
// feed (see TextBlock.jsx). Same underlying data and the same save path
// (saveTextBlock, so =/?/! shorthand still promotes into the Skeleton
// exactly as it does anywhere else) -- what changes is the environment:
// always-open instead of click-to-reveal, a real growing writing
// surface instead of a fixed three-line box, an attribution tag you can
// actually set (TEXT_ATTRIBUTION_TAGS existed but had no UI anywhere
// until now), a live word count, and a rendered "as it reads" preview
// with wiki-links resolved, underneath the raw editable draft.
//
// Deliberately still saves on blur, not continuously while typing: the
// Skeleton-promotion path rewrites this block's own text out from under
// it (a promoted line disappears once saved), so a background autosave
// racing an in-progress keystroke risked either losing input or
// resurrecting an already-promoted line. One discrete commit per editing
// session, same as the ordinary block, avoids that -- what's genuinely
// new here is the environment around it, not the save mechanics.

import { useEffect, useRef, useState } from 'react';
import { getSpaces, saveTextBlock, updateBlockContent } from '../api.js';
import { renderTextWithLinks } from './textLinks.jsx';
import { TEXT_ATTRIBUTION_TAGS } from '../registry/blocks.js';

function TextWorkshop({ block, onBlocksChanged }) {
  const [draft, setDraft] = useState(block.content.text || '');
  const [savedText, setSavedText] = useState(block.content.text || '');
  const [tag, setTag] = useState(block.content.tag);
  const [saving, setSaving] = useState(false);
  const [spaces, setSpaces] = useState(null);
  const [suggestion, setSuggestion] = useState(null); // { query, start, end }
  const textareaRef = useRef(null);

  // A real writing surface grows with what's written instead of
  // scrolling inside a fixed box -- the Workspace page around it is
  // already the thing that scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  function handleChange(event) {
    const value = event.target.value;
    setDraft(value);

    const cursor = event.target.selectionStart;
    const uptoCursor = value.slice(0, cursor);
    const openIndex = uptoCursor.lastIndexOf('[[');
    const between = openIndex === -1 ? null : uptoCursor.slice(openIndex + 2);
    if (between === null || between.includes(']]') || between.includes('\n')) {
      setSuggestion(null);
      return;
    }
    if (spaces === null) getSpaces().then(setSpaces);
    setSuggestion({ query: between, start: openIndex, end: cursor });
  }

  function pickSpace(space) {
    if (!suggestion) return;
    const before = draft.slice(0, suggestion.start);
    const after = draft.slice(suggestion.end);
    setDraft(`${before}[[${space.id}|${space.title}]]${after}`);
    setSuggestion(null);
    textareaRef.current?.focus();
  }

  async function handleBlur() {
    if (suggestion) return; // still mid-pick -- don't commit yet
    if (draft === savedText) return;
    setSaving(true);
    const updated = await saveTextBlock(block.id, draft);
    setSavedText(updated.content.text);
    setDraft(updated.content.text);
    setSaving(false);
    onBlocksChanged?.();
  }

  // Tag and text are independent edits, same principle Categories and
  // Workspace membership already follow elsewhere -- clicking a tag
  // commits only the tag, against the last *saved* text, so it never
  // silently commits an in-progress, not-yet-blurred draft edit.
  async function changeTag(candidate) {
    const nextTag = tag === candidate ? null : candidate;
    setTag(nextTag);
    await updateBlockContent(block.id, { tag: nextTag, text: savedText });
    onBlocksChanged?.();
  }

  const matches =
    suggestion && spaces
      ? spaces.filter((s) => s.title.toLowerCase().includes(suggestion.query.toLowerCase())).slice(0, 8)
      : [];
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const dirty = draft !== savedText;

  return (
    <div className="text-workshop">
      <div className="text-workshop-tags">
        {TEXT_ATTRIBUTION_TAGS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`text-workshop-tag${tag === candidate ? ' text-workshop-tag-active' : ''}`}
            onClick={() => changeTag(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        className="text-workshop-surface"
        value={draft}
        placeholder="Start writing..."
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && suggestion && matches[0]) {
            event.preventDefault();
            pickSpace(matches[0]);
          } else if (event.key === 'Escape') {
            setSuggestion(null);
          }
        }}
      />

      {suggestion && (
        <ul className="text-workshop-suggestions">
          {matches.length === 0 && <li>No matching Space</li>}
          {matches.map((space) => (
            <li key={space.id}>
              <button type="button" onClick={() => pickSpace(space)}>
                {space.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="text-workshop-footer">
        <span>
          {wordCount} word{wordCount === 1 ? '' : 's'}
        </span>
        <span className="text-workshop-status">
          {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
        </span>
      </div>

      {savedText && (
        <div className="text-workshop-preview">
          <p className="text-workshop-preview-label">As it reads</p>
          <p>{renderTextWithLinks(savedText, block.space_id)}</p>
        </div>
      )}
    </div>
  );
}

export default TextWorkshop;
