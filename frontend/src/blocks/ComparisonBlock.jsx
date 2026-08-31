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
  const { left, right, contrast, contrastNote } = content;

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
      {contrast && (
        <p className="contrast-flag">
          ⚡ Marked as a contrast
          {contrastNote && <>: {contrastNote}</>}
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
