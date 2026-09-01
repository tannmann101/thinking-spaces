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

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createSpace, getSpaces, getResourceTemplateByType } from '../api.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

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

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    const extraBlocks = [
      ...activeFacets.map((facet) => ({
        type: 'text',
        content: { tag: null, text: (facetValues[facet.name] || '').trim() },
        properties: { categories: [facet.name] },
      })),
      ...Object.entries(selectedRelations).map(([targetSpaceId, note]) => ({
        type: 'reference',
        content: { target_space_id: targetSpaceId, note: note.trim() || null },
        properties: { categories: [TOUCHES] },
      })),
    ];

    try {
      const space = await createSpace({
        title: title.trim(),
        templateId: null,
        extraBlocks,
        resourceSpaceIds: [],
        tags: ['resource', ...typeTags],
        categories: [...activeFacets.map((facet) => facet.name), TOUCHES],
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
        than starting from a blank Text/List page.
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
              <span className="editable-toggle" onClick={() => removeType(type)} title="Remove">
                ✕
              </span>
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
          <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
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
