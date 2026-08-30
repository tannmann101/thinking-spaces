// Renders one Text block: a paragraph, with an optional inline
// attribution tag (quote / paraphrase / reflection / inference), and
// optional inline [[Space]] links.
//
// Link syntax is `[[spaceId|Title]]`, stored directly in content.text
// -- the same convention as Obsidian-style wiki-links. The title is a
// snapshot taken at insertion time (like a wiki-link alias): if the
// target Space is later renamed, an existing link keeps showing the
// old title until someone re-edits it. That's an accepted tradeoff for
// keeping this simple -- no extra lookup needed to render a link.
//
// Editing only exists here because [[ ]] linking needs a real place to
// type -- there's still no general block-editing UI. Editing shows the
// raw text (including [[id|Title]] source), matching how Obsidian
// itself shows raw link syntax while editing and renders it read-only.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpaces, updateBlockContent } from '../api.js';

const LINK_PATTERN = /\[\[([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g;

function renderTextWithLinks(text, fromSpaceId) {
  const parts = [];
  let lastIndex = 0;
  let match;
  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const [full, spaceId, title] = match;
    const to = fromSpaceId ? `/spaces/${spaceId}?from=${fromSpaceId}` : `/spaces/${spaceId}`;
    parts.push(
      // stopPropagation so clicking the link navigates instead of also
      // triggering the paragraph's click-to-edit handler.
      <Link key={match.index} to={to} onClick={(event) => event.stopPropagation()}>
        {title}
      </Link>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// onSave lets a parent block (Comparison) override where an edit goes,
// for a Text-shaped side that isn't a standalone row in the blocks
// table. Without it, edits PATCH this block directly by its own id.
function TextBlock({ block, onSave }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { tag } = block.content;

  const [editing, setEditing] = useState(false);
  const [savedText, setSavedText] = useState(block.content.text);
  const [draft, setDraft] = useState(block.content.text);
  const [spaces, setSpaces] = useState(null);
  const [suggestion, setSuggestion] = useState(null); // { query, start, end }
  const textareaRef = useRef(null);

  function startEditing() {
    if (!editable) return;
    setDraft(savedText);
    setEditing(true);
  }

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
    if (spaces === null) {
      getSpaces().then(setSpaces);
    }
    setSuggestion({ query: between, start: openIndex, end: cursor });
  }

  function pickSpace(space) {
    if (!suggestion) return;
    const before = draft.slice(0, suggestion.start);
    const after = draft.slice(suggestion.end);
    const nextValue = `${before}[[${space.id}|${space.title}]]${after}`;
    setDraft(nextValue);
    setSuggestion(null);
    textareaRef.current?.focus();
  }

  async function finishEditing() {
    setEditing(false);
    setSuggestion(null);
    if (draft === savedText) return;
    setSavedText(draft);
    const newContent = { ...block.content, text: draft };
    if (onSave) await onSave(newContent);
    else await updateBlockContent(block.id, newContent);
  }

  const matches =
    suggestion && spaces
      ? spaces.filter((s) => s.title.toLowerCase().includes(suggestion.query.toLowerCase())).slice(0, 8)
      : [];

  if (editing) {
    return (
      <div>
        {tag && <strong>[{tag}] </strong>}
        <textarea
          ref={textareaRef}
          value={draft}
          rows={3}
          autoFocus
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit' }}
          onChange={handleChange}
          onBlur={() => {
            if (!suggestion) finishEditing();
          }}
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
          <ul>
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
        <button type="button" onClick={finishEditing}>
          Done
        </button>
      </div>
    );
  }

  return (
    <p onClick={startEditing} className={editable ? 'editable' : undefined}>
      {tag && <strong>[{tag}] </strong>}
      {renderTextWithLinks(savedText, block.space_id)}
    </p>
  );
}

export default TextBlock;
