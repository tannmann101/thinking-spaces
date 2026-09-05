// How a Media entry's content is built from the three ways a file or
// link actually gets into the app.
//
// Extracted so CreateResource.jsx (the guided "+ New Resource" flow)
// and NewBlockForm.jsx (adding one to a Space you're already in) can't
// drift on what a link-backed or file-backed Media entry looks like --
// the same reasoning textLinks.jsx, listItems.js and sessionActions.js
// were pulled out for. The shapes themselves are described in
// CLAUDE.md's Data model under "A Media block's content".

// A pasted link. The preview fields are a snapshot taken once, at
// creation -- never re-fetched (see the link-preview route), so a page
// that later changes its title doesn't rewrite your entry. A failed or
// skipped preview is fine: every field is nullable, and MediaBlock
// falls back to showing the raw URL.
export function mediaContentFromLink(url, caption = '', preview = null) {
  return {
    mediaType: 'link',
    url: url.trim(),
    caption: caption.trim(),
    linkTitle: preview?.title || null,
    linkDescription: preview?.description || null,
    linkImage: preview?.image || null,
    linkSiteName: preview?.siteName || null,
  };
}

// An uploaded file, as returned by uploadFile(). An image becomes an
// 'image' entry so it renders inline like any other picture; everything
// else becomes a 'document', which gets the preview-or-download
// treatment in mediaDocument.jsx.
export function mediaContentFromUpload(uploaded, caption = '') {
  return {
    mediaType: uploaded.mimeType?.startsWith('image/') ? 'image' : 'document',
    url: uploaded.url,
    caption: caption.trim(),
    fileName: uploaded.originalName,
    fileType: uploaded.mimeType,
  };
}

// An image somewhere else on the web, referenced by URL rather than
// copied in. The oldest of the three, and still the simplest.
export function mediaContentFromImageUrl(url, caption = '') {
  return { mediaType: 'image', url: url.trim(), caption: caption.trim() };
}
