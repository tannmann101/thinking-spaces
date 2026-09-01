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
// "What does Source Material mean?" turned out to be a labeling gap,
// not a wording gap -- the term itself is clear, but the block it
// named had no actual label once you landed on the Space page and just
// saw an ordinary, unmarked Writing entry. Every starter block here
// now carries a real Category (mirroring CreateResource.jsx's own
// starter blocks), so "Drawn From" / "Source Material" / "Draft" show
// up as named, filterable sections immediately, the same clarity a
// Resource's four facets already have.
//
// origin: 'internal' marks this as something the app itself produced
// -- the counterpart to a Resource's 'external' (see
// CreateResource.jsx) -- distinct provenance from a Resource even
// though a mature Synthesis can later be promoted to also carry the
// "resource" tag (see PromoteToResource in SpacePage.jsx) once it's
// settled enough to be cited the way an external Resource is.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSpace, getWorkItems } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const SYNTHESIS_KIND_SUGGESTIONS = [
  'essay',
  'story',
  'definition',
  'writing-entry',
  'poem',
  'letter',
  'dialogue',
  'argument',
  'summary',
  'proposal',
];

// Every starter block gets one of these Categories -- mirroring
// CreateResource.jsx's own starter blocks -- so "what is this block
// for" is answered by a visible, named section on the Space page
// itself, not just by copy in this creation form.
const DRAWN_FROM = 'Drawn From';
const SOURCE_MATERIAL = 'Source Material';
const DRAFT = 'Draft';

function CreateSynthesis() {
  usePageTitle('New Synthesis');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(null);
  const [kindInput, setKindInput] = useState('');
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

  // A Kind is single-valued (unlike a Resource's several type tags), so
  // typing a custom one replaces whatever was chosen before, the same
  // as clicking a different suggestion chip already does.
  function setCustomKind(raw) {
    const value = raw.trim().toLowerCase();
    setKindInput('');
    if (!value) return;
    setKind(value);
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
        properties: { categories: [DRAWN_FROM] },
      })),
      ...(selected.length > 0
        ? [{ type: 'text', content: { tag: null, text: sourceMaterialText }, properties: { categories: [SOURCE_MATERIAL] } }]
        : []),
      { type: 'text', content: { tag: null, text: '' }, properties: { categories: [DRAFT] } },
    ];

    try {
      const space = await createSpace({
        title: title.trim(),
        templateId: null,
        extraBlocks,
        resourceSpaceIds: [],
        tags: ['synthesis', ...(kind ? [kind] : [])],
        categories: [
          ...(sourceSpaceIds.length > 0 ? [DRAWN_FROM] : []),
          ...(selected.length > 0 ? [SOURCE_MATERIAL] : []),
          DRAFT,
        ],
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
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      <h1>New Synthesis</h1>
      <p>
        Compile a few existing Work items -- Assessments, Questions, and the rest of the Work
        catalog, from any Space -- into a new, more polished piece: an essay, a definition, a
        story, a plain writing entry.
      </p>
      <p className="mono-caption">
        Once it feels settled, a Synthesis can be promoted to Resource status right from its own
        Space page -- worth knowing going in, even though it's not something you'd do here at
        creation.
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
          {kind && !SYNTHESIS_KIND_SUGGESTIONS.includes(kind) && (
            <span
              className="category-chip category-chip-toggle category-chip-active"
              onClick={() => setKind(null)}
              title="Remove"
            >
              {kind}
            </span>
          )}
        </p>
        <p className="tag-row">
          <span className="tag-add-form">
            <input
              type="text"
              value={kindInput}
              placeholder="+ custom kind"
              onChange={(event) => setKindInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  setCustomKind(kindInput);
                }
              }}
            />
          </span>
        </p>

        <h2>{SOURCE_MATERIAL}</h2>
        <p>
          Which existing Work items should this draw from? Their text is copied in to start
          from, under a real &ldquo;{SOURCE_MATERIAL}&rdquo; Category on the new Space -- so it
          reads as a labeled section to draft alongside, not an unmarked block.
        </p>
        {workItems === null && <p>Loading...</p>}
        {workItems && workItems.length === 0 && (
          <p>No Work items exist yet -- create an Assessment, Question, or another Work Type in a Space first.</p>
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
    </div>
  );
}

export default CreateSynthesis;
