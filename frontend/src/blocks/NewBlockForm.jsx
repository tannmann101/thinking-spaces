// A minimal "add a block" form, shared between the Template editor
// (where it appends to a draft block_arrangement) and a live Space
// (where it POSTs immediately) -- what a new Text, List, Work, or Time
// block needs at creation is the same question in both places.
//
// This used to be limited to the self-contained Tools, on the reasoning
// that Reference and Media need real external input (a target Space, an
// image URL) and Comparison needs two sub-blocks. The consequence was
// that three of the five General Tools couldn't be added from a Space
// at all: attaching a PDF to a thought you were already having meant
// leaving for "+ New Resource", which creates a whole separate Space
// you didn't ask for. They're offered here now, each with the smallest
// intake it genuinely needs -- but only where they mean something: a
// `spaceId` marks a live Space, and without one (the Template editor,
// Creation Mode's drafts) they stay hidden, since a Template carrying a
// hardcoded Reference to one particular Space isn't a Template.
// Every Work Type fits the same mold Text and
// List already do (nothing but its own starting text), so they all
// join this form rather than getting a separate creation flow -- and
// the dropdown's Work/Time options are read straight from
// blockRegistry's `family` entries (each grouped under its own
// <optgroup>, not mixed flat with Text/List) rather than hardcoded
// here, so a new Work or Time Type needs no edit to this file at all,
// just its registry entry (though a Time Type whose shape isn't
// {statement, support, confidence} -- Milestone and Session both --
// still needs its own branch in handleSubmit below, same as Text and
// List already have, since "Time" isn't one shared shape the way Work is).
// List items created here are plain text only -- no checkbox/number/
// date/confidence at creation -- matching the same scope line the
// "+ Add item" control already draws; a Work block likewise starts
// with just its statement and an empty support list, both set/added
// afterward on the block itself. WORK_TYPE_STARTER_PROMPTS gives a few
// Work Types a nicer starting-text placeholder than the generic
// "The <label>" fallback every other Work Type gets automatically.
//
// `categories` is optional and only meaningful on a live Space that has
// already defined some (Template editing and Creation Mode's draft
// blocks have no Space yet to define categories against, so they omit
// this prop and the picker below simply doesn't render). Assigning at
// creation is what actually answers "picking Text/List feels like an
// abstract dropdown" -- the new block is filed under a real facet of
// the Space's topic from the moment it exists, not after the fact.
//
// `workspaceNames` is the equivalent for Workspaces, but holds plain
// draft-time NAMES rather than the real ids Workspace membership
// normally uses (`properties.workspaces`) -- Creation Mode's own
// Workspaces step names Workspaces before the Space (and so the
// Workspaces themselves) exist. The emitted spec carries
// `properties.workspaceNames`; whoever ultimately creates the block
// (createSpaceWithSetup, for Creation Mode) resolves those names to
// real ids once the Workspaces are real rows, same division of labor as
// everywhere else: this form only ever describes intent, never ids
// it can't yet know.

import { useEffect, useState } from 'react';
import { blockRegistry } from '../registry/blocks.js';
import { getSpaces, getLinkPreview, uploadFile } from '../api.js';
import {
  mediaContentFromImageUrl,
  mediaContentFromLink,
  mediaContentFromUpload,
} from './mediaSource.js';

// A nicer starting-text placeholder for a Work Type than the generic
// "The <label>" fallback below -- optional, since a new Work Type
// reads fine without an entry here (e.g. "The demonstration").
// Definition is the one that actually needs an override: its
// statement holds a term, not "the definition".
const WORK_TYPE_STARTER_PROMPTS = {
  definition: 'The term',
  formulation: 'This is fundamentally about',
};

const WORK_TYPES = Object.entries(blockRegistry).filter(([, entry]) => entry.family === 'work');
const TIME_TYPES = Object.entries(blockRegistry).filter(([, entry]) => entry.family === 'time');
const MAPPING_TYPES = Object.entries(blockRegistry).filter(([, entry]) => entry.family === 'mapping');

function workTypeStarterPrompt(type) {
  return WORK_TYPE_STARTER_PROMPTS[type] || `The ${blockRegistry[type].label.toLowerCase()}`;
}

// The three ways a Media entry gets its content -- see mediaSource.js.
const MEDIA_SOURCES = [
  { key: 'link', label: 'Paste a link' },
  { key: 'file', label: 'Upload a file' },
  { key: 'image', label: 'Image URL' },
];

function NewBlockForm({ onAdd, categories = [], workspaceNames = [], leadTypes = null, spaceId = null }) {
  // When a Workspace has a kind, start the picker on that kind's own
  // first Tool rather than on Writing -- "leads with" should mean the
  // selection too, not just the order of the list.
  const [type, setType] = useState(() => leadTypes?.find((key) => blockRegistry[key]) || 'text');
  const [text, setText] = useState('');
  const [laneLabel, setLaneLabel] = useState('');
  const [itemLines, setItemLines] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedWorkspaceNames, setSelectedWorkspaceNames] = useState([]);

  // Reference: which Space this points at. Fetched only once Reference
  // is actually picked -- no reason to load every Space to add a
  // paragraph.
  const [spaces, setSpaces] = useState([]);
  const [targetSpaceId, setTargetSpaceId] = useState('');

  // Media: which of the three intakes, and whatever that one produced.
  const [mediaSource, setMediaSource] = useState('link');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [linkPreview, setLinkPreview] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  const [busy, setBusy] = useState('');
  const [mediaError, setMediaError] = useState(null);

  // Comparison: the two sides, as plain text. Either can be turned into
  // a Reference afterward in the Comparison's own Workshop.
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');

  useEffect(() => {
    if (type !== 'reference' || spaces.length > 0) return;
    getSpaces()
      .then((all) => setSpaces(all.filter((space) => space.id !== spaceId)))
      .catch(() => setSpaces([]));
  }, [type, spaceId, spaces.length]);

  // Fetched on blur rather than per keystroke -- one discrete action,
  // the same reasoning save-on-blur uses elsewhere. A failed preview
  // never blocks adding the link itself; MediaBlock falls back to
  // showing the raw URL.
  async function fetchPreview() {
    const url = mediaUrl.trim();
    if (!url || mediaSource !== 'link') return;
    setBusy('preview');
    setMediaError(null);
    try {
      setLinkPreview(await getLinkPreview(url));
    } catch (err) {
      setLinkPreview(null);
      setMediaError(`Could not preview that link (${err.message}) -- it can still be added.`);
    } finally {
      setBusy('');
    }
  }

  async function handleFileChosen(file) {
    if (!file) return;
    setBusy('upload');
    setMediaError(null);
    try {
      setUploaded(await uploadFile(file));
    } catch (err) {
      setUploaded(null);
      setMediaError(err.message);
    } finally {
      setBusy('');
    }
  }

  function toggleCategory(category) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category]
    );
  }

  function toggleWorkspaceName(name) {
    setSelectedWorkspaceNames((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    );
  }

  // Not a <form> -- this gets rendered inside the Template editor's own
  // <form> (and, on a live Space, right alongside one), and nested
  // <form> elements are invalid HTML that Chromium resolves by routing
  // the inner submit button's click to the outer form instead. A plain
  // button + onClick sidesteps that entirely.
  function handleSubmit() {
    const properties = {
      ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {}),
      ...(selectedWorkspaceNames.length > 0 ? { workspaceNames: selectedWorkspaceNames } : {}),
    };
    if (type === 'text') {
      onAdd({ type: 'text', content: { tag: null, text }, properties });
    } else if (type === 'list') {
      const items = itemLines
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ id: crypto.randomUUID(), text: line }));
      onAdd({ type: 'list', content: { laneLabel: laneLabel.trim(), items }, properties });
    } else if (type === 'milestone') {
      // Starts with just a label; target date, reached state, and note
      // are all set/toggled afterward on the block itself.
      onAdd({
        type: 'milestone',
        content: { label: text.trim(), targetDate: null, reached: false, reachedAt: null, note: '' },
        properties,
      });
    } else if (type === 'session') {
      // Starts with just a label; Start/Stop and the note are both set
      // afterward on the block itself.
      onAdd({
        type: 'session',
        content: { label: text.trim(), startedAt: null, endedAt: null, durationMinutes: null, note: '' },
        properties,
      });
    } else if (type === 'reference') {
      // A pointer at another Space. The note is optional and editable
      // afterward on the entry itself, same as every other field here.
      onAdd({
        type: 'reference',
        content: { target_space_id: targetSpaceId, note: text.trim() },
        properties,
      });
    } else if (type === 'media') {
      // Whichever of the three intakes was used -- the content shapes
      // live in mediaSource.js, shared with CreateResource.jsx.
      const content =
        mediaSource === 'file'
          ? mediaContentFromUpload(uploaded, mediaCaption)
          : mediaSource === 'link'
            ? mediaContentFromLink(mediaUrl, mediaCaption, linkPreview)
            : mediaContentFromImageUrl(mediaUrl, mediaCaption);
      onAdd({ type: 'media', content, properties });
    } else if (type === 'comparison') {
      // Both sides start as plain text; either can be swapped for a
      // Reference afterward in the Comparison's own Workshop.
      onAdd({
        type: 'comparison',
        content: {
          left: { kind: 'text', tag: null, text: leftText.trim() },
          right: { kind: 'text', tag: null, text: rightText.trim() },
          contrast: false,
          contrastNote: '',
        },
        properties,
      });
    } else if (type === 'wordEvolution') {
      // Starts with just the term; each sense-shift is added afterward
      // on the block itself.
      onAdd({ type: 'wordEvolution', content: { term: text.trim(), senses: [] }, properties });
    } else if (type === 'conceptMap') {
      // Starts with just the referent; its gloss and every rendering
      // are added afterward on the block itself.
      onAdd({ type: 'conceptMap', content: { referent: text.trim(), gloss: '', renderings: [] }, properties });
    } else if (type === 'model') {
      // Starts with just the subject; components and the relations
      // between them are added afterward on the block itself.
      onAdd({ type: 'model', content: { subject: text.trim(), components: [], relations: [] }, properties });
    } else {
      // Any Work Type -- all of them start with just a statement and
      // an empty support list; both are added to/set afterward on the
      // block itself.
      //
      // Guarded rather than a bare fallback: this branch used to catch
      // *any* type without one of its own, which meant a newly
      // registered non-Work Tool would silently be created with Work's
      // content shape. Now an unhandled type is refused loudly instead.
      if (blockRegistry[type]?.family !== 'work') {
        throw new Error(
          `No starter content defined for entry type "${type}" -- add a branch in NewBlockForm.handleSubmit.`
        );
      }
      onAdd({ type, content: { statement: text.trim(), support: [], confidence: 'tentative' }, properties });
    }
    setText('');
    setLaneLabel('');
    setItemLines('');
    setSelectedCategories([]);
    setSelectedWorkspaceNames([]);
    setTargetSpaceId('');
    setMediaUrl('');
    setMediaCaption('');
    setLinkPreview(null);
    setUploaded(null);
    setMediaError(null);
    setLeftText('');
    setRightText('');
  }

  // What each of the three needs before it can be added at all.
  const canSubmit =
    type === 'reference'
      ? Boolean(targetSpaceId)
      : type === 'media'
        ? mediaSource === 'file'
          ? Boolean(uploaded)
          : Boolean(mediaUrl.trim())
        : type === 'comparison'
          ? Boolean(leftText.trim() && rightText.trim())
          : true;

  return (
    <div className="new-block-form">
      <label>
        Entry type:{' '}
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {/* When a Workspace has a kind, the Tools that kind is built
              around lead the list -- they still appear in their own
              family group below, since a kind leads rather than
              restricts (see registry/workspaceKinds.js). */}
          {leadTypes && leadTypes.length > 0 && (
            <optgroup label="For this Workspace">
              {leadTypes
                .filter((key) => blockRegistry[key])
                .map((key) => (
                  <option key={`lead-${key}`} value={key}>
                    {blockRegistry[key].label}
                  </option>
                ))}
            </optgroup>
          )}
          <optgroup label="General">
            <option value="text">Writing</option>
            <option value="list">List</option>
            {/* Only on a live Space -- see the note at the top of this
                file for why a Template can't carry these. */}
            {spaceId && <option value="reference">Reference</option>}
            {spaceId && <option value="media">Media</option>}
            {spaceId && <option value="comparison">Comparison</option>}
          </optgroup>
          <optgroup label="Work">
            {WORK_TYPES.map(([key, entry]) => (
              <option key={key} value={key}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Time">
            {TIME_TYPES.map(([key, entry]) => (
              <option key={key} value={key}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Mapping">
            {MAPPING_TYPES.map(([key, entry]) => (
              <option key={key} value={key}>
                {entry.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {/* The dropdown itself can only show a bare label per option --
          native <option>s don't support anything richer -- so picking
          between, say, "Deduction" and "Implication" meant already
          knowing the Tools catalog by heart. This mirrors the same
          description text ToolsPage.jsx shows for the same registry
          entry, right at the point of choosing instead of only
          elsewhere in the app. */}
      {blockRegistry[type]?.description && (
        <p className="new-block-type-description">{blockRegistry[type].description}</p>
      )}
      {/* Reading one description at a time (above) still means
          reselecting through all 11 Work Types to compare close calls
          like Insight vs. Implication -- confirmed via direct question
          that sharpening any one description wouldn't fix this (the
          registry copy already names the relationship directly, e.g.
          Implication's own "a softer sibling to Deduction"); the actual
          gap is not being able to see every description at once while
          still deciding. This panel is exactly that -- every Work
          Type's label and description in one place, registry-driven so
          a future Work Type needs no edit here either -- with clicking
          a label selecting it in the dropdown above as a shortcut, not
          a requirement. */}
      <details className="work-type-compare">
        <summary>Compare Work Types</summary>
        <dl>
          {WORK_TYPES.map(([key, entry]) => (
            <div key={key} className="work-type-compare-row">
              <dt>
                <button type="button" className="work-type-compare-pick" onClick={() => setType(key)}>
                  {entry.label}
                </button>
              </dt>
              <dd>{entry.description}</dd>
            </div>
          ))}
        </dl>
      </details>
      <br />
      {type === 'reference' ? (
        <>
          <label className="stacked-field">
            Points at:{' '}
            <select value={targetSpaceId} onChange={(event) => setTargetSpaceId(event.target.value)}>
              <option value="">(pick a Space)</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.title}
                </option>
              ))}
            </select>
          </label>
          <input
            type="text"
            value={text}
            placeholder="Why this connects (optional)"
            className="stacked-field"
            onChange={(event) => setText(event.target.value)}
          />
        </>
      ) : type === 'media' ? (
        <>
          <p className="media-source-row">
            {MEDIA_SOURCES.map((source) => (
              <button
                key={source.key}
                type="button"
                className={mediaSource === source.key ? 'chip chip-on' : 'chip'}
                onClick={() => {
                  setMediaSource(source.key);
                  setLinkPreview(null);
                  setUploaded(null);
                  setMediaError(null);
                }}
              >
                {source.label}
              </button>
            ))}
          </p>
          {mediaSource === 'file' ? (
            <>
              <input
                type="file"
                className="stacked-field"
                onChange={(event) => handleFileChosen(event.target.files?.[0])}
              />
              {busy === 'upload' && <p className="empty-note">Uploading...</p>}
              {uploaded && <p className="empty-note">Attached: {uploaded.originalName}</p>}
            </>
          ) : (
            <input
              type="url"
              value={mediaUrl}
              placeholder={mediaSource === 'link' ? 'https://...' : 'Image URL'}
              className="stacked-field"
              onChange={(event) => setMediaUrl(event.target.value)}
              onBlur={fetchPreview}
            />
          )}
          {busy === 'preview' && <p className="empty-note">Fetching preview...</p>}
          {linkPreview?.title && <p className="empty-note">Preview: {linkPreview.title}</p>}
          {mediaError && <p className="empty-note">{mediaError}</p>}
          <input
            type="text"
            value={mediaCaption}
            placeholder="Caption (optional)"
            className="stacked-field"
            onChange={(event) => setMediaCaption(event.target.value)}
          />
        </>
      ) : type === 'comparison' ? (
        <>
          <input
            type="text"
            value={leftText}
            placeholder="One side"
            className="stacked-field"
            onChange={(event) => setLeftText(event.target.value)}
          />
          <input
            type="text"
            value={rightText}
            placeholder="The other side"
            className="stacked-field"
            onChange={(event) => setRightText(event.target.value)}
          />
        </>
      ) : type !== 'list' ? (
        <textarea
          value={text}
          placeholder={
            type === 'text'
              ? 'Starting text (can be left blank)'
              : type === 'milestone'
              ? 'Milestone label (can be left blank)'
              : type === 'session'
              ? 'Session label (can be left blank)'
              : type === 'wordEvolution'
              ? 'The word or term (can be left blank)'
              : type === 'conceptMap'
              ? 'The referent -- what is actually being referred to (can be left blank)'
              : type === 'model'
              ? 'What is being modeled (can be left blank)'
              : `${workTypeStarterPrompt(type)} (can be left blank)`
          }
          rows={2}
          className="stacked-field"
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <>
          <input
            type="text"
            value={laneLabel}
            placeholder="List heading (optional)"
            className="stacked-field"
            onChange={(event) => setLaneLabel(event.target.value)}
          />
          <textarea
            value={itemLines}
            placeholder={'Starting items, one per line (optional)'}
            rows={3}
            className="stacked-field"
            onChange={(event) => setItemLines(event.target.value)}
          />
        </>
      )}
      {categories.length > 0 && (
        <p className="block-category-row">
          File under:{' '}
          {categories.map((category) => (
            <span
              key={category}
              className={`category-chip category-chip-toggle${
                selectedCategories.includes(category) ? ' category-chip-active' : ''
              }`}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </span>
          ))}
        </p>
      )}
      {workspaceNames.length > 0 && (
        <p className="block-workspace-row">
          Add to Workspace:{' '}
          {workspaceNames.map((name) => (
            <span
              key={name}
              className={`workspace-chip workspace-chip-toggle${
                selectedWorkspaceNames.includes(name) ? ' workspace-chip-active' : ''
              }`}
              onClick={() => toggleWorkspaceName(name)}
            >
              {name}
            </span>
          ))}
        </p>
      )}
      <p>
        <button type="button" className="btn" onClick={handleSubmit} disabled={!canSubmit || Boolean(busy)}>
          + Add Entry
        </button>
      </p>
    </div>
  );
}

export default NewBlockForm;
