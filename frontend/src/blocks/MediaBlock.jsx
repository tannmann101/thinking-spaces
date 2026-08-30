// Renders one Media block. Image is fully implemented (embeds
// content.url in an <img>); audio and sketch-embed are stubbed --
// there's no creation UI for any Block type yet, and building out
// playback/embedding for those before they're needed would be getting
// ahead of the roadmap.

function MediaBlock({ block }) {
  const { mediaType, url, caption } = block.content;

  if (mediaType === 'image') {
    return (
      <figure>
        <img src={url} alt={caption || ''} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  if (mediaType === 'audio') {
    return <p>[Audio block — playback not implemented yet. {caption}]</p>;
  }

  if (mediaType === 'sketch') {
    return <p>[Sketch embed — not implemented yet. {caption}]</p>;
  }

  return <p>Unknown media type: {mediaType}</p>;
}

export default MediaBlock;
