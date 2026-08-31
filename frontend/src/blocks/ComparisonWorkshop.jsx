// The Comparison Workshop: what a Comparison block becomes inside a
// Workspace, instead of the compact two-column row it is in the
// ordinary feed (see ComparisonBlock.jsx). Each side still renders
// through the ordinary TextBlock/ReferenceBlock (a side isn't its own
// row in the blocks table, so its own bespoke Workshop -- which expects
// a real block id -- doesn't apply here the same way; the `onSave`
// override those components already support is what makes an embedded
// side editable at all). What's new is the container around them: a
// larger, clearer side-by-side layout with each side in its own card, a
// swap button (getting left/right backwards is an easy real mistake),
// and the contrast flag as a clear chip toggle with a real auto-growing
// note surface instead of a single-line input.

import { useEffect, useRef, useState } from 'react';
import TextBlock from './TextBlock.jsx';
import ReferenceBlock from './ReferenceBlock.jsx';
import { updateBlockContent } from '../api.js';

function ComparisonWorkshop({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const [content, setContent] = useState(block.content);
  const [noteDraft, setNoteDraft] = useState(content.contrastNote || '');
  const { contrast, contrastNote } = content;
  const noteRef = useRef(null);

  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [noteDraft, contrast]);

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
    if (!editable) return;
    if (noteDraft === (contrastNote || '')) return;
    persist({ ...content, contrastNote: noteDraft });
  }

  function swapSides() {
    if (!editable) return;
    persist({ ...content, left: content.right, right: content.left });
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
    <div className="comparison-workshop">
      <p className="comparison-workshop-controls">
        <span
          className={`category-chip category-chip-toggle${contrast ? ' category-chip-active' : ''}`}
          onClick={toggleContrast}
        >
          ⚡ {contrast ? 'Marked as a contrast' : 'Not marked as a contrast'}
        </span>
        {editable && (
          <button type="button" className="btn-ghost-small" onClick={swapSides} title="Swap left and right">
            ⇄ Swap sides
          </button>
        )}
      </p>

      {contrast && (
        <textarea
          ref={noteRef}
          className="comparison-workshop-note"
          value={noteDraft}
          placeholder="What's the contrast? (optional)"
          disabled={!editable}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={finishEditingNote}
        />
      )}

      <div className="comparison-workshop-grid">
        <div className="comparison-workshop-side">{renderSide('left')}</div>
        <div className="comparison-workshop-seam">vs</div>
        <div className="comparison-workshop-side">{renderSide('right')}</div>
      </div>
    </div>
  );
}

export default ComparisonWorkshop;
