// The Text Workshop: what a Text block becomes inside a Workspace,
// instead of the small click-to-edit paragraph it is in the ordinary
// feed (see TextBlock.jsx). A real writing surface, redesigned around
// discrete, individually-tagged lines rather than one blob of text with
// one tag for the whole thing:
//
// - Each line is its own stable unit ({id, text, tag}) -- click to
//   edit, Enter commits it and opens a new blank line after it, blur
//   commits without adding one. A line's own margin control lets you
//   set/change/clear its attribution tag (quote/paraphrase/reflection/
//   inference) independently of editing its text.
// - [[ ]] wiki-link autocomplete works the same as it always has,
//   scoped to whichever line is currently being edited.
// - "File in Skeleton" on any line copies that line's text into a
//   chosen lane as a new tentative item, leaving the line itself
//   exactly where it is -- the alternate capture path alongside typed
//   =/?/! shorthand (which still promotes and removes, via ordinary
//   line editing below). Structuring something already written is not
//   the same action as writing it as shorthand in the first place.
// - Focus mode enlarges this block's own presentation and hides its own
//   secondary controls; hiding *other* blocks on the page is handled
//   one level up, by whatever passes the onFocus/focused props in
//   (WorkspacePage.jsx).
//
// Saving happens per line, on commit -- not continuously while typing --
// same reasoning TextWorkshop always has: the =/?/! promotion path
// rewrites the block's own lines out from under it, and a background
// autosave racing that or an in-progress keystroke risks lost input or
// a resurrected already-promoted line.

import { useState } from 'react';
import { getSpaces, saveTextBlock, fileLineInLane } from '../api.js';
import { renderTextWithLinks } from './textLinks.jsx';
import { TEXT_ATTRIBUTION_TAGS } from '../registry/blocks.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';

// A Tension pairs two *claims*, so filing only ever offers the three
// claim-bearing lanes -- Tensions itself is created by pairing existing
// statements (see the Skeleton page), not by filing a line into it.
const FILEABLE_LANES = SKELETON_LANE_LABELS.filter((lane) => lane.key !== 'tensions');

function TextWorkshop({ block, onBlocksChanged, focused = false, onFocus }) {
  const [lines, setLines] = useState(block.content.lines);
  const [editingLineId, setEditingLineId] = useState(null);
  const [draft, setDraft] = useState('');
  const [spaces, setSpaces] = useState(null);
  const [suggestion, setSuggestion] = useState(null); // { query, start, end }
  const [tagPopoverId, setTagPopoverId] = useState(null);
  const [filePopoverId, setFilePopoverId] = useState(null);

  async function persist(nextLines) {
    const updated = await saveTextBlock(block.id, nextLines);
    setLines(updated.content.lines);
    onBlocksChanged?.();
    return updated.content.lines;
  }

  function startEditingLine(line) {
    setTagPopoverId(null);
    setFilePopoverId(null);
    setDraft(line.text);
    setEditingLineId(line.id);
  }

  function handleChange(event) {
    const value = event.target.value;
    setDraft(value);

    const cursor = event.target.selectionStart;
    const uptoCursor = value.slice(0, cursor);
    const openIndex = uptoCursor.lastIndexOf('[[');
    const between = openIndex === -1 ? null : uptoCursor.slice(openIndex + 2);
    if (between === null || between.includes(']]')) {
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
  }

  // Enter commits the line being edited and, unless it was a wiki-link
  // pick, opens a fresh blank line right after it -- the ordinary
  // "keep writing" flow. Blur alone (handleBlur below) commits without
  // adding one, for when you're just leaving the field.
  async function commitAndAdvance() {
    const editedId = editingLineId;
    const withEdit = lines.map((line) => (line.id === editedId ? { ...line, text: draft } : line));
    const newLine = { id: crypto.randomUUID(), text: '', tag: null };
    const index = withEdit.findIndex((line) => line.id === editedId);
    const nextLines = [...withEdit.slice(0, index + 1), newLine, ...withEdit.slice(index + 1)];
    setSuggestion(null);
    setEditingLineId(newLine.id);
    setDraft('');
    await persist(nextLines);
  }

  async function handleBlur() {
    if (suggestion) return; // still mid-pick -- don't commit yet
    const editedId = editingLineId;
    setEditingLineId(null);
    const current = lines.find((line) => line.id === editedId);
    if (!current || current.text === draft) return;
    const nextLines = lines.map((line) => (line.id === editedId ? { ...line, text: draft } : line));
    await persist(nextLines);
  }

  async function setTag(lineId, tag) {
    setTagPopoverId(null);
    const nextLines = lines.map((line) => (line.id === lineId ? { ...line, tag } : line));
    await persist(nextLines);
  }

  async function removeLine(lineId) {
    await persist(lines.filter((line) => line.id !== lineId));
  }

  async function fileInLane(line, laneKey) {
    setFilePopoverId(null);
    if (!line.text.trim()) return;
    await fileLineInLane(block.space_id, laneKey, line.text.trim());
    onBlocksChanged?.();
  }

  const matches =
    suggestion && spaces
      ? spaces.filter((s) => s.title.toLowerCase().includes(suggestion.query.toLowerCase())).slice(0, 8)
      : [];
  const wordCount = lines
    .map((line) => line.text.trim())
    .filter(Boolean)
    .reduce((count, text) => count + text.split(/\s+/).length, 0);

  return (
    <div className={`text-workshop${focused ? ' text-workshop-focused' : ''}`}>
      {onFocus && (
        <button type="button" className="text-workshop-focus-toggle" onClick={() => onFocus(focused ? null : block.id)}>
          {focused ? '✕ Exit focus' : '⤢ Focus'}
        </button>
      )}

      <div className="text-workshop-lines">
        {lines.map((line) => {
          const isEditing = editingLineId === line.id;
          return (
            <div key={line.id} className="text-workshop-line">
              <button
                type="button"
                className={`text-workshop-tag-glyph${line.tag ? ` text-workshop-tag-glyph-${line.tag}` : ''}`}
                onClick={() => setTagPopoverId(tagPopoverId === line.id ? null : line.id)}
                title={line.tag || 'No attribution tag -- click to set one'}
              >
                {line.tag ? line.tag[0].toUpperCase() : '·'}
              </button>

              <div className="text-workshop-line-body">
                {isEditing ? (
                  <input
                    type="text"
                    className="text-workshop-line-input"
                    value={draft}
                    autoFocus
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (suggestion && matches[0]) pickSpace(matches[0]);
                        else commitAndAdvance();
                      } else if (event.key === 'Escape') {
                        setSuggestion(null);
                      }
                    }}
                  />
                ) : (
                  <p className="text-workshop-line-text editable" onClick={() => startEditingLine(line)}>
                    {line.text ? renderTextWithLinks(line.text, block.space_id) : <em>(empty line)</em>}
                  </p>
                )}

                {isEditing && suggestion && (
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

                {!focused && tagPopoverId === line.id && (
                  <p className="text-workshop-popover">
                    {TEXT_ATTRIBUTION_TAGS.map((candidate) => (
                      <span
                        key={candidate}
                        className={`category-chip category-chip-toggle${line.tag === candidate ? ' category-chip-active' : ''}`}
                        onClick={() => setTag(line.id, candidate)}
                      >
                        {candidate}
                      </span>
                    ))}
                    {line.tag && (
                      <span className="category-chip category-chip-toggle" onClick={() => setTag(line.id, null)}>
                        clear
                      </span>
                    )}
                  </p>
                )}

                {!focused && filePopoverId === line.id && (
                  <p className="text-workshop-popover">
                    File in:{' '}
                    {FILEABLE_LANES.map((lane) => (
                      <span key={lane.key} className="category-chip category-chip-toggle" onClick={() => fileInLane(line, lane.key)}>
                        {lane.label}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {!focused && (
                <span className="text-workshop-line-controls">
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => setFilePopoverId(filePopoverId === line.id ? null : line.id)}
                    title="File this line into a Skeleton lane (copies it, leaves it here)"
                  >
                    File
                  </button>
                  <button type="button" className="btn-ghost-small" onClick={() => removeLine(line.id)} title="Remove line">
                    ✕
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!focused && <p className="text-workshop-footer">{wordCount} word{wordCount === 1 ? '' : 's'}</p>}
    </div>
  );
}

export default TextWorkshop;
