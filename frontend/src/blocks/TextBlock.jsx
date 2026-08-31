// Renders one Text block: a paragraph (or several tagged lines), with
// optional inline [[Space]] links.
//
// Link syntax is `[[spaceId|Title]]`, stored directly in a line's text
// -- the same convention as Obsidian-style wiki-links. The title is a
// snapshot taken at insertion time (like a wiki-link alias): if the
// target Space is later renamed, an existing link keeps showing the
// old title until someone re-edits it. That's an accepted tradeoff for
// keeping this simple -- no extra lookup needed to render a link.
//
// A standalone Text block's content is `{ lines: [{id, text, tag}] }` --
// each line carries its own attribution tag and a stable id, so a tag
// survives an edit to a *different* line (see TextWorkshop.jsx, where
// per-line tagging actually happens). This plain inline view stays
// simple on purpose: click to edit reopens every line joined as one
// ordinary multi-line textarea, and saving re-splits it back into
// lines, matching each line to its old self by exact text so an
// untouched line keeps its id and tag -- only a line that actually
// changed loses its tag, which is the honest default (a changed
// sentence's old attribution may no longer be right).
//
// Comparison embeds a "text-kind" side directly in its own content --
// never as its own row in the blocks table -- and that side keeps the
// older `{tag, text}` shape (one tag, one string) on purpose: it's
// passed here via `onSave`, and this component renders whichever shape
// `block.content` actually has, so Comparison's sides don't need their
// own bespoke component just to stay on the shape they've always used.
//
// A line starting with =, ?, or ! is Skeleton shorthand (a Premise,
// Open Question, or Tension) and gets promoted out of this block's
// lines when saved -- see saveTextBlockWithPromotion on the backend.
// That only applies to a standalone Text block saving itself (the
// default path below); a Comparison side saves as plain text with no
// promotion, same as before.

import { useRef, useState } from 'react';
import { getSpaces, saveTextBlock } from '../api.js';
import { renderTextWithLinks } from './textLinks.jsx';

// Re-splits an edited joined string back into lines, reusing an old
// line's id/tag wherever its exact text still appears (so editing one
// line doesn't disturb every other line's attribution) and minting a
// fresh, untagged line for anything genuinely new or changed.
function relineFromText(newText, oldLines) {
  const oldByText = new Map();
  oldLines.forEach((line) => {
    const bucket = oldByText.get(line.text) || [];
    bucket.push(line);
    oldByText.set(line.text, bucket);
  });
  return newText.split('\n').map((text) => {
    const bucket = oldByText.get(text);
    const reused = bucket && bucket.shift();
    return reused || { id: crypto.randomUUID(), text, tag: null };
  });
}

// onSave lets a parent block (Comparison) override where an edit goes,
// for a Text-shaped side that isn't a standalone row in the blocks
// table. Without it, edits PATCH this block directly by its own id.
// onBlocksChanged is called after a standalone save, since promotion
// may have just changed a *different* block (a Skeleton lane) that
// this component has no other way to know about.
function TextBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const legacy = !block.content.lines; // Comparison's embedded {tag, text} sides
  const savedLines = legacy
    ? [{ id: 'legacy', text: block.content.text, tag: block.content.tag }]
    : block.content.lines;

  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState(savedLines);
  const [draft, setDraft] = useState(savedLines.map((line) => line.text).join('\n'));
  const [spaces, setSpaces] = useState(null);
  const [suggestion, setSuggestion] = useState(null); // { query, start, end }
  const textareaRef = useRef(null);

  function startEditing() {
    if (!editable) return;
    setDraft(lines.map((line) => line.text).join('\n'));
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
    const unchanged = draft === lines.map((line) => line.text).join('\n');
    // No "skip if unchanged" shortcut on the standalone path: even
    // unchanged text can still contain un-promoted =/?/! shorthand that
    // needs processing.
    if (unchanged && onSave) return;
    if (onSave) {
      const nextText = draft;
      setLines([{ id: 'legacy', text: nextText, tag: block.content.tag }]);
      await onSave({ ...block.content, text: nextText });
    } else {
      const nextLines = relineFromText(draft, lines);
      // The backend may have stripped promoted shorthand lines, so the
      // saved lines it returns -- not our local draft -- are what's real.
      const updated = await saveTextBlock(block.id, nextLines);
      setLines(updated.content.lines);
      onBlocksChanged?.();
    }
  }

  const matches =
    suggestion && spaces
      ? spaces.filter((s) => s.title.toLowerCase().includes(suggestion.query.toLowerCase())).slice(0, 8)
      : [];

  if (editing) {
    return (
      <div className="text-block">
        <textarea
          ref={textareaRef}
          value={draft}
          rows={3}
          autoFocus
          className="field-full field-inherit-font"
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
    <div className="text-block" onClick={startEditing}>
      {lines.map((line) => (
        <p key={line.id} className={editable ? 'editable' : undefined}>
          {line.tag && <span className="tag-label">{line.tag}</span>}
          {renderTextWithLinks(line.text, block.space_id)}
        </p>
      ))}
    </div>
  );
}

export default TextBlock;
