// The Media Workshop: what a Media block becomes inside a Workspace,
// instead of the small inline figure it is in the ordinary feed (see
// MediaBlock.jsx). Same save path (updateBlockContent) -- what's new is
// the environment: a larger, click-to-zoom image presentation, bigger
// caption typography, and an editable URL, which closes a real gap --
// previously a broken or placeholder image URL could never be fixed
// without deleting the block and starting over.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';

function MediaWorkshop({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const { mediaType } = block.content;
  const [savedUrl, setSavedUrl] = useState(block.content.url || '');
  const [urlDraft, setUrlDraft] = useState(savedUrl);
  const [editingUrl, setEditingUrl] = useState(false);
  const [savedCaption, setSavedCaption] = useState(block.content.caption || '');
  const [captionDraft, setCaptionDraft] = useState(savedCaption);
  const [editingCaption, setEditingCaption] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  async function persist(next) {
    await updateBlockContent(block.id, { ...block.content, ...next });
    onBlocksChanged?.();
  }

  function finishEditingCaption() {
    setEditingCaption(false);
    if (captionDraft === savedCaption) return;
    setSavedCaption(captionDraft);
    persist({ caption: captionDraft });
  }

  function finishEditingUrl() {
    setEditingUrl(false);
    if (urlDraft.trim() === savedUrl) return;
    setSavedUrl(urlDraft.trim());
    persist({ url: urlDraft.trim() });
  }

  const captionNode = editingCaption ? (
    <input
      type="text"
      value={captionDraft}
      autoFocus
      className="media-workshop-caption-input"
      onChange={(event) => setCaptionDraft(event.target.value)}
      onBlur={finishEditingCaption}
      onKeyDown={(event) => event.key === 'Enter' && finishEditingCaption()}
    />
  ) : (
    <span className={editable ? 'editable' : undefined} onClick={() => editable && setEditingCaption(true)}>
      {savedCaption || (editable ? '(add a caption)' : '')}
    </span>
  );

  const urlNode = editable && (
    <p className="media-workshop-url-row">
      {editingUrl ? (
        <input
          type="text"
          value={urlDraft}
          autoFocus
          className="media-workshop-url-input"
          onChange={(event) => setUrlDraft(event.target.value)}
          onBlur={finishEditingUrl}
          onKeyDown={(event) => event.key === 'Enter' && finishEditingUrl()}
        />
      ) : (
        <span className="editable" onClick={() => setEditingUrl(true)} title="Click to change the source URL">
          source: {savedUrl || '(no URL set)'}
        </span>
      )}
    </p>
  );

  if (mediaType === 'image') {
    return (
      <div className="media-workshop">
        <figure className="media-workshop-figure">
          {savedUrl ? (
            <img
              src={savedUrl}
              alt={savedCaption}
              className="media-workshop-image"
              onClick={() => setZoomed(true)}
            />
          ) : (
            <div className="media-workshop-placeholder">No image URL set yet</div>
          )}
          <figcaption className="media-workshop-caption">{captionNode}</figcaption>
        </figure>
        {urlNode}
        {zoomed && (
          <div className="media-workshop-lightbox" onClick={() => setZoomed(false)}>
            <img src={savedUrl} alt={savedCaption} />
          </div>
        )}
      </div>
    );
  }

  const placeholderLabel =
    mediaType === 'audio' ? 'Audio — playback not implemented yet' : 'Sketch embed — not implemented yet';

  return (
    <div className="media-workshop">
      <div className="media-workshop-placeholder">{placeholderLabel}</div>
      <p className="media-workshop-caption">{captionNode}</p>
      {urlNode}
    </div>
  );
}

export default MediaWorkshop;
