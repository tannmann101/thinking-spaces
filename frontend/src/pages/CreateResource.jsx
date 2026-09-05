// Resource creation is deliberately its own flow, not another cluster
// card inside ordinary Creation Mode -- a Resource isn't a train of
// thought like a Space, it's something that gets surfaced *within*
// Spaces, so the questions worth asking up front are different: what
// this thing is, what it affords (or a type-tailored replacement for
// both -- see below), what it touches (or is touched by), and what it
// offers. Those facets become the new Space's own starting Categories
// (see the Categories feature), each seeded with a block, so a
// Resource never starts as an empty, undifferentiated page.
//
// Under the hood a Resource is still an ordinary Space (tagged
// "resource", plus whatever type tags are chosen here) -- that's what
// gives it, for free, everything else a Space already has: Tools,
// Views, the Graph, the Trail, the Log, deletion, all of it. Nothing
// about "what it engages with" needed new machinery; it needed a
// creation flow that actually asks about it.
//
// origin: 'external' marks this as something brought in from outside
// the app -- the counterpart to Synthesis's 'internal' (see
// CreateSynthesis.jsx) -- so the Space page can show at a glance
// whether a given Space is a citable thing you sourced, or one the
// app itself produced through Work/Synthesis.
//
// Resource Templates (see backend/src/db/queries/resourceTemplates.js)
// replace the three descriptive facets below with a type-tailored set
// of their own, once a chosen type tag matches one -- "What is this,
// plainly" means something different for a Book than for a Riddle. The
// fourth, structural facet (Touches / Touched By) stays the same for
// every type: it's a mechanical capability (create a Reference to an
// existing Space), not a description that varies by what kind of thing
// this is.
//
// Content ingestion (see CLAUDE.md) added two alternatives to the
// guided-questions flow above, chosen via the Source toggle below: paste
// a link (fetched server-side for an Open Graph preview, see
// api.getLinkPreview) or upload a file (see api.uploadFile). Either one
// produces a single 'media' block (mediaType 'link'/'image'/'document')
// filed under a "Source" Category, in place of the three facet-driven
// Text blocks -- store & view only, no text extraction from an uploaded
// file's contents. Type tags and Touches/Touched-By stay identical
// across all three source kinds, since sub-typing and cross-Space
// relations are orthogonal to how the content actually got in here.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createSpace, getSpaces, getResourceTemplateByType, getLinkPreview, uploadFile } from '../api.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { mediaContentFromLink, mediaContentFromUpload } from '../blocks/mediaSource.js';

// Deliberately says "app," not "tool" -- a sub-type suggestion here
// named "tool" would collide with the app's own capitalized "Tool"
// concept (the Block/View catalog at /tools), even though they mean
// completely different things.
// "lens" added alongside the others for a specific kind of Resource: an
// interpretive lens (etymology, phenomenology, anthropology, ...) worth
// having on hand across many different Spaces, not just one -- see the
// Formulation Work Type (registry/blocks.js) and CLAUDE.md.
const RESOURCE_TYPE_SUGGESTIONS = ['book', 'person', 'account', 'app', 'place', 'media', 'lens'];

const TOUCHES = 'Touches / Touched By';

// Used only when no chosen type tag matches a Resource Template -- the
// original three questions, generic enough to fit anything.
const DEFAULT_FACETS = [
  {
    name: 'What It Is',
    prompt: 'What is this Resource, plainly -- its nature, where it comes from, the basics.',
  },
  {
    name: 'What It Affords',
    prompt: 'What does having this around actually let you do?',
  },
  {
    name: 'What It Offers',
    prompt: 'What value or content does it actually offer once you engage with it?',
  },
];

function CreateResource() {
  usePageTitle('New Resource');
  const [title, setTitle] = useState('');
  const [typeTags, setTypeTags] = useState([]);
  const [typeInput, setTypeInput] = useState('');
  const [resourceTemplate, setResourceTemplate] = useState(null);
  const [facetValues, setFacetValues] = useState({});
  const [allSpaces, setAllSpaces] = useState(null);
  const [selectedRelations, setSelectedRelations] = useState({}); // spaceId -> note string
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Source: which of the three ways this Resource's own content actually
  // gets in. 'guided' is the original facet-questions flow above; 'link'
  // and 'file' each produce one Media block instead (see the header
  // comment for why).
  const [sourceKind, setSourceKind] = useState('guided');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [linkPreviewError, setLinkPreviewError] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [sourceCaption, setSourceCaption] = useState('');

  useEffect(() => {
    getSpaces().then(setAllSpaces).catch(() => setAllSpaces([]));
  }, []);

  // The first chosen type tag (in the order added) that matches a real
  // Resource Template wins -- checked in order, not in parallel, so a
  // slower-resolving earlier tag can't be overtaken by a faster later
  // one. Falls back to no template (the generic facets) if none match,
  // or if the lookup itself fails.
  useEffect(() => {
    let cancelled = false;
    async function findTemplate() {
      for (const type of typeTags) {
        const match = await getResourceTemplateByType(type).catch(() => null);
        if (match) {
          if (!cancelled) setResourceTemplate(match);
          return;
        }
      }
      if (!cancelled) setResourceTemplate(null);
    }
    findTemplate();
    return () => {
      cancelled = true;
    };
  }, [typeTags]);

  // A genuinely different active template means the old facet answers
  // don't apply anymore -- reset rather than carry stale text under a
  // now-unrelated facet name. Adjusting state directly during render
  // (React's own recommended pattern for "reset when a derived value
  // changes") rather than an effect, keyed on id (not the whole object)
  // so this only fires when the actually matched template changes, not
  // on every typeTags edit.
  const activeTemplateId = resourceTemplate?.id ?? null;
  const [lastTemplateId, setLastTemplateId] = useState(activeTemplateId);
  if (activeTemplateId !== lastTemplateId) {
    setLastTemplateId(activeTemplateId);
    setFacetValues({});
  }

  const activeFacets = resourceTemplate ? resourceTemplate.facets : DEFAULT_FACETS;

  function addType(rawType) {
    const type = rawType.trim().toLowerCase();
    setTypeInput('');
    if (!type || type === 'resource' || typeTags.includes(type)) return;
    setTypeTags([...typeTags, type]);
  }

  function removeType(type) {
    setTypeTags(typeTags.filter((t) => t !== type));
  }

  function toggleRelation(spaceId) {
    setSelectedRelations((current) => {
      const next = { ...current };
      if (spaceId in next) {
        delete next[spaceId];
      } else {
        next[spaceId] = '';
      }
      return next;
    });
  }

  function setRelationNote(spaceId, note) {
    setSelectedRelations((current) => ({ ...current, [spaceId]: note }));
  }

  // Fetches on blur rather than as-you-type, same "one discrete action,
  // not a request per keystroke" reasoning the rest of the app already
  // follows for save-on-blur fields. A failed fetch doesn't block
  // submission -- see canSubmit below -- the link itself is still worth
  // saving even with no preview metadata.
  async function fetchLinkPreview() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinkPreviewLoading(true);
    setLinkPreviewError(null);
    try {
      const preview = await getLinkPreview(url);
      setLinkPreview(preview);
    } catch (err) {
      setLinkPreview(null);
      setLinkPreviewError(err.message);
    } finally {
      setLinkPreviewLoading(false);
    }
  }

  async function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadedFile(null);
    try {
      const result = await uploadFile(file);
      setUploadedFile(result);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const canSubmit =
    Boolean(title.trim()) &&
    !submitting &&
    (sourceKind === 'guided' ||
      (sourceKind === 'link' && Boolean(linkUrl.trim())) ||
      (sourceKind === 'file' && Boolean(uploadedFile) && !uploading));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const relationBlocks = Object.entries(selectedRelations).map(([targetSpaceId, note]) => ({
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: note.trim() || null },
      properties: { categories: [TOUCHES] },
    }));

    let extraBlocks;
    let categories;

    if (sourceKind === 'link') {
      extraBlocks = [
        {
          type: 'media',
          content: mediaContentFromLink(linkUrl, sourceCaption, linkPreview),
          properties: { categories: ['Source'] },
        },
        ...relationBlocks,
      ];
      categories = ['Source', TOUCHES];
    } else if (sourceKind === 'file') {
      extraBlocks = [
        {
          type: 'media',
          content: mediaContentFromUpload(uploadedFile, sourceCaption),
          properties: { categories: ['Source'] },
        },
        ...relationBlocks,
      ];
      categories = ['Source', TOUCHES];
    } else {
      extraBlocks = [
        ...activeFacets.map((facet) => ({
          type: 'text',
          content: { tag: null, text: (facetValues[facet.name] || '').trim() },
          properties: { categories: [facet.name] },
        })),
        ...relationBlocks,
      ];
      categories = [...activeFacets.map((facet) => facet.name), TOUCHES];
    }

    try {
      const space = await createSpace({
        title: title.trim(),
        templateId: null,
        extraBlocks,
        resourceSpaceIds: [],
        tags: ['resource', ...typeTags],
        categories,
        goal: null,
        origin: 'external',
      });
      navigate(`/spaces/${space.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      <h1>New Resource</h1>
      <p>
        A Resource is something outside (or alongside) your thinking that's worth having on hand --
        a book, a person, an account, an app, anything. This homes in on what it actually is, rather
        than starting from a blank Text/List page. Answer a few guided questions, paste a link, or
        upload a file (a PDF, a Markdown/.txt note, an image, or an Office document).
      </p>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Name</label>
          <br />
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this Resource called?"
            required
          />
        </div>

        <h2>Type</h2>
        <p>
          Optional -- helps sub-type this Resource alongside every other one. Some types have their
          own tailored set of questions below (see <Link to="/resource-templates">Resource Templates</Link>).
        </p>
        <p className="tag-row">
          {typeTags.map((type) => (
            <span key={type} className="tag-chip">
              {type}{' '}
              <button type="button" className="editable-toggle" onClick={() => removeType(type)} title="Remove">
                ✕
              </button>
            </span>
          ))}
          <span className="tag-add-form">
            <input
              type="text"
              value={typeInput}
              placeholder="+ type"
              onChange={(event) => setTypeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addType(typeInput);
                }
              }}
            />
          </span>
        </p>
        <p className="resource-type-suggestions">
          {RESOURCE_TYPE_SUGGESTIONS.filter((s) => !typeTags.includes(s)).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="btn-ghost-small"
              onClick={() => addType(suggestion)}
            >
              + {suggestion}
            </button>
          ))}
        </p>
        <h2>Source</h2>
        <p>How does this Resource's own content actually get in here?</p>
        <p className="category-chip-row">
          <button
            type="button"
            className={`category-chip category-chip-toggle${sourceKind === 'guided' ? ' category-chip-active' : ''}`}
            onClick={() => setSourceKind('guided')}
          >
            Guided questions
          </button>
          <button
            type="button"
            className={`category-chip category-chip-toggle${sourceKind === 'link' ? ' category-chip-active' : ''}`}
            onClick={() => setSourceKind('link')}
          >
            Paste a link
          </button>
          <button
            type="button"
            className={`category-chip category-chip-toggle${sourceKind === 'file' ? ' category-chip-active' : ''}`}
            onClick={() => setSourceKind('file')}
          >
            Upload a file
          </button>
        </p>

        {sourceKind === 'guided' && (
          <>
            {resourceTemplate && (
              <p className="resource-template-active">
                Using the <strong>{resourceTemplate.label}</strong> template's own questions below.
              </p>
            )}

            {activeFacets.map((facet) => (
              <div key={facet.name}>
                <h2>{facet.name}</h2>
                <p>{facet.prompt}</p>
                <textarea
                  value={facetValues[facet.name] || ''}
                  rows={3}
                  className="field-full"
                  placeholder="(optional -- can be filled in later)"
                  onChange={(event) => setFacetValues((current) => ({ ...current, [facet.name]: event.target.value }))}
                />
              </div>
            ))}
          </>
        )}

        {sourceKind === 'link' && (
          <div className="resource-source-link">
            <label htmlFor="link-url">URL</label>
            <br />
            <input
              id="link-url"
              type="url"
              value={linkUrl}
              className="field-full"
              placeholder="https://..."
              onChange={(event) => setLinkUrl(event.target.value)}
              onBlur={fetchLinkPreview}
            />
            {linkPreviewLoading && <p className="mono-caption">Fetching a preview...</p>}
            {linkPreviewError && (
              <p className="mono-caption">Could not fetch a preview ({linkPreviewError}) -- the link will still be saved as-is.</p>
            )}
            {linkPreview && (
              <div className="media-link-card">
                {linkPreview.image && <img src={linkPreview.image} alt="" className="media-link-image" />}
                <div className="media-link-body">
                  <div className="media-link-title">{linkPreview.title}</div>
                  {linkPreview.description && <div className="media-link-description">{linkPreview.description}</div>}
                  {linkPreview.siteName && <div className="media-link-site">{linkPreview.siteName}</div>}
                </div>
              </div>
            )}
            <label htmlFor="link-note">Note (optional)</label>
            <br />
            <textarea
              id="link-note"
              value={sourceCaption}
              rows={2}
              className="field-full"
              placeholder="Why this link matters, or what to remember about it"
              onChange={(event) => setSourceCaption(event.target.value)}
            />
          </div>
        )}

        {sourceKind === 'file' && (
          <div className="resource-source-file">
            <input
              type="file"
              onChange={handleFileSelected}
              accept=".pdf,.md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            />
            {uploading && <p className="mono-caption">Uploading...</p>}
            {uploadError && <p className="mono-caption">Could not upload that file: {uploadError}</p>}
            {uploadedFile && (
              <p className="mono-caption">
                Uploaded: {uploadedFile.originalName} ({Math.round(uploadedFile.size / 1024)} KB)
              </p>
            )}
            <label htmlFor="file-note">Note (optional)</label>
            <br />
            <textarea
              id="file-note"
              value={sourceCaption}
              rows={2}
              className="field-full"
              placeholder="Why this file matters, or what to remember about it"
              onChange={(event) => setSourceCaption(event.target.value)}
            />
          </div>
        )}

        <h2>{TOUCHES}</h2>
        <p>Which existing Spaces does this Resource relate to? Each becomes a real reference.</p>
        {allSpaces === null && <p>Loading...</p>}
        {allSpaces && allSpaces.length === 0 && <p>No other Spaces exist yet to relate this to.</p>}
        {allSpaces && allSpaces.length > 0 && (
          <ul className="checkbox-list">
            {allSpaces.map((space) => (
              <li key={space.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={space.id in selectedRelations}
                    onChange={() => toggleRelation(space.id)}
                  />{' '}
                  {space.title}
                </label>
                {space.id in selectedRelations && (
                  <input
                    type="text"
                    value={selectedRelations[space.id]}
                    placeholder="how does it relate? (optional)"
                    className="field-width-60 field-spaced"
                    onChange={(event) => setRelationNote(space.id, event.target.value)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        <p>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {submitting ? 'Creating...' : 'Create Resource'}
          </button>
        </p>

        {error && <p>Could not create Resource: {error}</p>}
      </form>
      </main>
    </div>
  );
}

export default CreateResource;
