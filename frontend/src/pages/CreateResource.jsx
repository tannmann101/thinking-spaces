// Resource creation is deliberately its own flow, not another cluster
// card inside ordinary Creation Mode -- a Resource isn't a train of
// thought like a Space, it's something that gets surfaced *within*
// Spaces, so the questions worth asking up front are different: what
// this thing is, what it affords, what it touches (or is touched by),
// and what it offers. Those four facets become the new Space's own
// starting Categories (see the Categories feature), each seeded with a
// block, so a Resource never starts as an empty, undifferentiated page.
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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSpace, getSpaces } from '../api.js';
import TopNav from '../components/TopNav.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// Deliberately says "app," not "tool" -- a sub-type suggestion here
// named "tool" would collide with the app's own capitalized "Tool"
// concept (the Block/View catalog at /tools), even though they mean
// completely different things.
const RESOURCE_TYPE_SUGGESTIONS = ['book', 'person', 'account', 'app', 'place', 'media'];

// The four facets this flow homes in on, in order. Used both as the
// question labels and, verbatim, as the new Space's starting Categories
// -- so what you fill in here is exactly what you'll see as filterable
// sections on the Resource's own page afterward.
const WHAT_IT_IS = 'What It Is';
const WHAT_IT_AFFORDS = 'What It Affords';
const TOUCHES = 'Touches / Touched By';
const WHAT_IT_OFFERS = 'What It Offers';

function CreateResource() {
  usePageTitle('New Resource');
  const [title, setTitle] = useState('');
  const [typeTags, setTypeTags] = useState([]);
  const [typeInput, setTypeInput] = useState('');
  const [whatItIs, setWhatItIs] = useState('');
  const [whatItAffords, setWhatItAffords] = useState('');
  const [whatItOffers, setWhatItOffers] = useState('');
  const [allSpaces, setAllSpaces] = useState(null);
  const [selectedRelations, setSelectedRelations] = useState({}); // spaceId -> note string
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getSpaces().then(setAllSpaces).catch(() => setAllSpaces([]));
  }, []);

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
      { type: 'text', content: { tag: null, text: whatItIs.trim() }, properties: { categories: [WHAT_IT_IS] } },
      {
        type: 'text',
        content: { tag: null, text: whatItAffords.trim() },
        properties: { categories: [WHAT_IT_AFFORDS] },
      },
      ...Object.entries(selectedRelations).map(([targetSpaceId, note]) => ({
        type: 'reference',
        content: { target_space_id: targetSpaceId, note: note.trim() || null },
        properties: { categories: [TOUCHES] },
      })),
      {
        type: 'text',
        content: { tag: null, text: whatItOffers.trim() },
        properties: { categories: [WHAT_IT_OFFERS] },
      },
    ];

    try {
      const space = await createSpace({
        title: title.trim(),
        templateId: null,
        extraBlocks,
        resourceSpaceIds: [],
        tags: ['resource', ...typeTags],
        categories: [WHAT_IT_IS, WHAT_IT_AFFORDS, TOUCHES, WHAT_IT_OFFERS],
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
    <main>
      <TopNav />
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
        <p>Optional -- helps sub-type this Resource alongside every other one.</p>
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

        <h2>{WHAT_IT_IS}</h2>
        <p>What is this Resource, plainly -- its nature, where it comes from, the basics.</p>
        <textarea
          value={whatItIs}
          rows={3}
          className="field-full"
          placeholder="(optional -- can be filled in later)"
          onChange={(event) => setWhatItIs(event.target.value)}
        />

        <h2>{WHAT_IT_AFFORDS}</h2>
        <p>What does having this around actually let you do?</p>
        <textarea
          value={whatItAffords}
          rows={3}
          className="field-full"
          placeholder="(optional -- can be filled in later)"
          onChange={(event) => setWhatItAffords(event.target.value)}
        />

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

        <h2>{WHAT_IT_OFFERS}</h2>
        <p>What value or content does it actually offer once you engage with it?</p>
        <textarea
          value={whatItOffers}
          rows={3}
          className="field-full"
          placeholder="(optional -- can be filled in later)"
          onChange={(event) => setWhatItOffers(event.target.value)}
        />

        <p>
          <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Creating...' : 'Create Resource'}
          </button>
        </p>

        {error && <p>Could not create Resource: {error}</p>}
      </form>
    </main>
  );
}

export default CreateResource;
