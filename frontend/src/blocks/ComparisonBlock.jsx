// Renders one Comparison block: two Text or Reference "sides" shown
// side by side, with an optional mark that the pair is a contrast
// (plus a note on what the contrast is). Each side is rendered by
// reusing TextBlock/ReferenceBlock directly, rather than re-implementing
// their display -- a side is just that block type's content, embedded.

import TextBlock from './TextBlock.jsx';
import ReferenceBlock from './ReferenceBlock.jsx';

function renderSide(side) {
  if (side.kind === 'text') {
    return <TextBlock block={{ content: side }} />;
  }
  if (side.kind === 'reference') {
    return <ReferenceBlock block={{ content: side }} />;
  }
  return <p>Unknown comparison side: {side.kind}</p>;
}

function ComparisonBlock({ block }) {
  const { left, right, contrast, contrastNote } = block.content;
  return (
    <div>
      {contrast && (
        <p>
          <strong>⚡ Marked as a contrast</strong>
          {contrastNote && <>: {contrastNote}</>}
        </p>
      )}
      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>{renderSide(left)}</div>
        <div style={{ flex: 1 }}>{renderSide(right)}</div>
      </div>
    </div>
  );
}

export default ComparisonBlock;
