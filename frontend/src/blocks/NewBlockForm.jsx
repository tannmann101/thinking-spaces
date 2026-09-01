// A minimal "add a block" form, shared between the Template editor
// (where it appends to a draft block_arrangement) and a live Space
// (where it POSTs immediately) -- what a new Text, List, Work, or Time
// block needs at creation is the same question in both places.
//
// Limited to the self-contained Tools: Reference and Media need real
// external input (a target Space, an image URL) that doesn't fit a
// quick "+ Add Block" form, and Comparison needs two sub-blocks -- none
// of those belong here. Every Work Type fits the same mold Text and
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

import { useState } from 'react';
import { blockRegistry } from '../registry/blocks.js';

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

function workTypeStarterPrompt(type) {
  return WORK_TYPE_STARTER_PROMPTS[type] || `The ${blockRegistry[type].label.toLowerCase()}`;
}

function NewBlockForm({ onAdd, categories = [], workspaceNames = [] }) {
  const [type, setType] = useState('text');
  const [text, setText] = useState('');
  const [laneLabel, setLaneLabel] = useState('');
  const [itemLines, setItemLines] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedWorkspaceNames, setSelectedWorkspaceNames] = useState([]);

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
    } else {
      // Any Work Type -- all of them start with just a statement and
      // an empty support list; both are added to/set afterward on the
      // block itself.
      onAdd({ type, content: { statement: text.trim(), support: [], confidence: 'tentative' }, properties });
    }
    setText('');
    setLaneLabel('');
    setItemLines('');
    setSelectedCategories([]);
    setSelectedWorkspaceNames([]);
  }

  return (
    <div className="new-block-form">
      <label>
        Block type:{' '}
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <optgroup label="General">
            <option value="text">Text</option>
            <option value="list">List</option>
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
      <br />
      {type !== 'list' ? (
        <textarea
          value={text}
          placeholder={
            type === 'text'
              ? 'Starting text (can be left blank)'
              : type === 'milestone'
              ? 'Milestone label (can be left blank)'
              : type === 'session'
              ? 'Session label (can be left blank)'
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
        <button type="button" className="btn" onClick={handleSubmit}>
          + Add Block
        </button>
      </p>
    </div>
  );
}

export default NewBlockForm;
