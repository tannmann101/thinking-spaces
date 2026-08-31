// Renders one Media block. Image is fully implemented (embeds
// content.url in an <img>, with an editable caption); audio and
// sketch-embed are stubbed -- there's no creation UI for any Block
// type yet, and building out playback/embedding for those before
// they're needed would be getting ahead of the roadmap.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';

function MediaBlock({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const { mediaType, url } = block.content;

  const [editing, setEditing] = useState(false);
  const [savedCaption, setSavedCaption] = useState(block.content.caption || '');
  const [draft, setDraft] = useState(savedCaption);

  async function finishEditing() {
    setEditing(false);
    if (draft === savedCaption) return;
    setSavedCaption(draft);
    await updateBlockContent(block.id, { ...block.content, caption: draft });
    onBlocksChanged?.();
  }

  const captionNode = editing ? (
    <input
      type="text"
      value={draft}
      autoFocus
      style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit' }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finishEditing}
      onKeyDown={(event) => event.key === 'Enter' && finishEditing()}
    />
  ) : (
    <span className={editable ? 'editable' : undefined} onClick={() => editable && setEditing(true)}>
      {savedCaption || (editable ? '(add a caption)' : '')}
    </span>
  );

  if (mediaType === 'image') {
    return (
      <figure>
        <img src={url} alt={savedCaption} />
        <figcaption>{captionNode}</figcaption>
      </figure>
    );
  }

  if (mediaType === 'audio') {
    return <p>[Audio block — playback not implemented yet. {captionNode}]</p>;
  }

  if (mediaType === 'sketch') {
    return <p>[Sketch embed — not implemented yet. {captionNode}]</p>;
  }

  return <p>Unknown media type: {mediaType}</p>;
}

export default MediaBlock;
