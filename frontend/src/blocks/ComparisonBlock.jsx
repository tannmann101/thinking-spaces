// Renders one Comparison block: two Text or Reference "sides" shown
// side by side, with an optional mark that the pair is a contrast
// (plus a note on what the contrast is). Each side is rendered by
// reusing TextBlock/ReferenceBlock directly, rather than re-implementing
// their display -- a side is just that block type's content, embedded.
//
// A side isn't its own row in the blocks table, so editing one means
// PATCHing this Comparison block's whole content with that side
// replaced -- that's what the onSave passed into each side does.

import { useState } from 'react';
import TextBlock from './TextBlock.jsx';
import ReferenceBlock from './ReferenceBlock.jsx';
import { updateBlockContent } from '../api.js';

function ComparisonBlock({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const [content, setContent] = useState(block.content);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(content.contrastNote || '');
  const { contrast, contrastNote } = content;

  // The contrast flag and its note were set once at creation with no
  // way to change them afterward -- a toggle here, an editable note
  // there, same as every other small marker in this app.
  async function persist(newContent) {
    setContent(newContent);
    await updateBlockContent(block.id, newContent);
    onBlocksChanged?.();
  }

  function toggleContrast() {
    if (!editable) return;
    persist({ ...content, contrast: !contrast });
  }

  function finishEditingNote() {
    setEditingNote(false);
    if (!editable) return;
    if (noteDraft === (contrastNote || '')) return;
    persist({ ...content, contrastNote: noteDraft });
  }

  function renderSide(sideKey) {
    const side = content[sideKey];
    const pseudoBlock = { content: side };
    const onSave = editable
      ? async (newSideContent) => {
          const newContent = { ...content, [sideKey]: newSideContent };
          setContent(newContent);
          await updateBlockContent(block.id, newContent);
          onBlocksChanged?.();
        }
      : undefined;

    if (side.kind === 'text') {
      return <TextBlock block={pseudoBlock} onSave={onSave} />;
    }
    if (side.kind === 'reference') {
      return <ReferenceBlock block={pseudoBlock} onSave={onSave} />;
    }
    return <p>Unknown comparison side: {side.kind}</p>;
  }

  return (
    <div className="comparison-block">
      {(contrast || editable) && (
        <p className="contrast-flag">
          <span
            className={editable ? 'editable-toggle' : undefined}
            onClick={toggleContrast}
            title={editable ? 'Click to toggle whether this pair is marked as a contrast' : undefined}
          >
            ⚡ {contrast ? 'Marked as a contrast' : '(not marked as a contrast)'}
          </span>
          {contrast && (
            <>
              {': '}
              {editingNote ? (
                <input
                  type="text"
                  value={noteDraft}
                  autoFocus
                  className="field-width-40 field-inherit-font"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onBlur={finishEditingNote}
                  onKeyDown={(event) => event.key === 'Enter' && finishEditingNote()}
                />
              ) : (
                <span
                  className={editable ? 'editable' : undefined}
                  onClick={() => {
                    if (!editable) return;
                    setNoteDraft(contrastNote || '');
                    setEditingNote(true);
                  }}
                >
                  {contrastNote || (editable ? '(add a note)' : '')}
                </span>
              )}
            </>
          )}
        </p>
      )}
      <div className="comparison-grid">
        <div>{renderSide('left')}</div>
        <div className="seam" />
        <div>{renderSide('right')}</div>
      </div>
    </div>
  );
}

export default ComparisonBlock;
