// Synthesis creation: pulls together several existing Work items
// (Assessments, Questions, and any future kind) -- possibly from
// different Spaces -- into a new, more polished piece: an essay, a
// definition entry, a story, a plain writing entry. Modeled directly
// on Resource creation (CreateResource.jsx): under the hood this is
// still just an ordinary Space, tagged "synthesis" plus an optional
// freely-chosen kind, pre-seeded with real content instead of starting
// blank.
//
// The selected items' own statement text is copied (not just linked)
// into a starting "Source Material" Text block, one line per item --
// the same "copy, don't just point at it" instinct behind the
// Skeleton's File action, so there's something to actually draft from
// immediately. A Reference block per distinct source Space is added
// alongside it purely for traceability -- the same Graph/backlink
// machinery every other Reference already gets for free.
//
// origin: 'internal' marks this as something the app itself produced
// -- the counterpart to a Resource's 'external' (see
// CreateResource.jsx) -- distinct provenance from a Resource even
// though a mature Synthesis can later be promoted to also carry the
// "resource" tag (see PromoteToResource in SpacePage.jsx) once it's
// settled enough to be cited the way an external Resource is.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createSpace, getWorkItems } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';

const SYNTHESIS_KIND_SUGGESTIONS = ['essay', 'story', 'definition', 'writing-entry'];

function CreateSynthesis() {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(null);
  const [workItems, setWorkItems] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getWorkItems().then(setWorkItems).catch(() => setWorkItems([]));
  }, []);

  function toggleItem(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    const selected = (workItems || []).filter((item) => selectedIds.includes(item.id));
    const sourceSpaceIds = [...new Set(selected.map((item) => item.space_id))];
    const sourceMaterialText = selected
      .map((item) => `[${blockRegistry[item.type]?.label || item.type}] ${item.content.statement}`)
      .join('\n');

    const extraBlocks = [
      ...sourceSpaceIds.map((spaceId) => ({
        type: 'reference',
        content: { target_space_id: spaceId, note: 'a source for this Synthesis' },
        properties: {},
      })),
      ...(selected.length > 0
        ? [{ type: 'text', content: { tag: null, text: sourceMaterialText }, properties: {} }]
        : []),
      { type: 'text', content: { tag: null, text: '' }, properties: {} },
    ];

    try {
      const space = await createSpace({
        title: title.trim(),
        templateId: null,
        extraBlocks,
        resourceSpaceIds: [],
        tags: ['synthesis', ...(kind ? [kind] : [])],
        categories: [],
        goal: null,
        origin: 'internal',
      });
      navigate(`/spaces/${space.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  // Search narrows which items show, grouped by Space same as before --
  // it never touches selectedIds, so filtering the view and losing
  // sight of a group doesn't lose a selection already made in it.
  const filteredWorkItems = (workItems || []).filter((item) =>
    item.content.statement.toLowerCase().includes(search.trim().toLowerCase())
  );
  const bySpace = new Map();
  filteredWorkItems.forEach((item) => {
    const bucket = bySpace.get(item.space_title) || [];
    bucket.push(item);
    bySpace.set(item.space_title, bucket);
  });

  return (
    <main>
      <Link to="/" className="back-link">
        &larr; Back to Dashboard
      </Link>
      <h1>New Synthesis</h1>
      <p>
        Compile a few existing Assessments and Questions -- from any Space -- into a new, more
        polished piece: an essay, a definition, a story, a plain writing entry.
      </p>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title</label>
          <br />
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this piece called?"
            required
          />
        </div>

        <h2>Kind</h2>
        <p>Optional -- helps sub-type this Synthesis alongside every other one.</p>
        <p className="resource-type-suggestions">
          {SYNTHESIS_KIND_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={`category-chip category-chip-toggle${kind === suggestion ? ' category-chip-active' : ''}`}
              onClick={() => setKind(kind === suggestion ? null : suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </p>

        <h2>Source material</h2>
        <p>Which existing Work items should this draw from? Their text is copied in to start from.</p>
        {workItems === null && <p>Loading...</p>}
        {workItems && workItems.length === 0 && (
          <p>No Assessments or Questions exist yet -- create some in a Space first.</p>
        )}
        {workItems && workItems.length > 0 && (
          <p className="synthesis-picker-toolbar">
            <input
              type="text"
              value={search}
              placeholder="Search by statement..."
              className="space-search-input"
              onChange={(event) => setSearch(event.target.value)}
            />
            {selectedIds.length > 0 && (
              <span className="synthesis-selected-count">
                {selectedIds.length} selected
              </span>
            )}
          </p>
        )}
        {workItems && workItems.length > 0 && filteredWorkItems.length === 0 && (
          <p>No Work items match &ldquo;{search}&rdquo;.</p>
        )}
        {[...bySpace.entries()].map(([spaceTitle, items]) => (
          <div key={spaceTitle}>
            <h4>{spaceTitle}</h4>
            <ul className="checkbox-list">
              {items.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleItem(item.id)}
                    />{' '}
                    <span className="tag-chip">{blockRegistry[item.type]?.label || item.type}</span>{' '}
                    {item.content.statement}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p>
          <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Creating...' : 'Create Synthesis'}
          </button>
        </p>

        {error && <p>Could not create Synthesis: {error}</p>}
      </form>
    </main>
  );
}

export default CreateSynthesis;
