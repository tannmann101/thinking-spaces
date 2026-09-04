// Renders one Media block. Image, link, and document are fully
// implemented; audio and sketch-embed are still stubbed -- building out
// playback/embedding for those before they're needed would be getting
// ahead of the roadmap.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import DocumentPreview from './mediaDocument.jsx';

// onSave lets a parent override where an edit goes -- a Comparison side
// or the Tools catalog's own interactive demo (see ToolsPage.jsx's
// DemoBlock), same pattern every other simple Block already follows
// (see ReferenceBlock.jsx).
function MediaBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { mediaType, url } = block.content;

  const [editing, setEditing] = useState(false);
  const [savedCaption, setSavedCaption] = useState(block.content.caption || '');
  const [draft, setDraft] = useState(savedCaption);

  async function finishEditing() {
    setEditing(false);
    if (draft === savedCaption) return;
    setSavedCaption(draft);
    const newContent = { ...block.content, caption: draft };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
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
    <button
      type="button"
      className={editable ? 'editable' : undefined}
      disabled={!editable}
      onClick={() => setEditing(true)}
    >
      {savedCaption || (editable ? '(add a caption)' : '')}
    </button>
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

  if (mediaType === 'link') {
    const { linkTitle, linkDescription, linkImage, linkSiteName } = block.content;
    return (
      <div className="media-block media-block-link">
        <a href={url} target="_blank" rel="noopener noreferrer" className="media-link-card">
          {linkImage && <img src={linkImage} alt="" className="media-link-image" />}
          <div className="media-link-body">
            <div className="media-link-title">{linkTitle || url}</div>
            {linkDescription && <div className="media-link-description">{linkDescription}</div>}
            {linkSiteName && <div className="media-link-site">{linkSiteName}</div>}
          </div>
        </a>
        <figcaption>{captionNode}</figcaption>
      </div>
    );
  }

  if (mediaType === 'document') {
    const { fileName, fileType } = block.content;
    return (
      <div className="media-block media-block-document">
        <DocumentPreview url={url} fileName={fileName} fileType={fileType} />
        <figcaption>{captionNode}</figcaption>
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
