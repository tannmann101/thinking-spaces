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
      className="field-full field-inherit-font"
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
      <div className="media-block">
        <figure>
          {url ? (
            <img src={url} alt={savedCaption} />
          ) : (
            <div className="media-placeholder">No image URL set yet</div>
          )}
          <figcaption>{captionNode}</figcaption>
        </figure>
      </div>
    );
  }

  if (mediaType === 'audio') {
    return (
      <div className="media-block">
        <div className="media-placeholder">Audio — playback not implemented yet</div>
        <figcaption>{captionNode}</figcaption>
      </div>
    );
  }

  if (mediaType === 'sketch') {
    return (
      <div className="media-block">
        <div className="media-placeholder">Sketch embed — not implemented yet</div>
        <figcaption>{captionNode}</figcaption>
      </div>
    );
  }

  return <p>Unknown media type: {mediaType}</p>;
}

export default MediaBlock;
