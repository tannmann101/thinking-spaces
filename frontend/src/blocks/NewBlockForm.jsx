// A minimal "add a block" form, shared between the Template editor
// (where it appends to a draft block_arrangement) and a live Space
// (where it POSTs immediately) -- what a new Text, List, or Work block
// needs at creation is the same question in both places.
//
// Limited to the self-contained Tools: Reference and Media need real
// external input (a target Space, an image URL) that doesn't fit a
// quick "+ Add Block" form, and Comparison needs two sub-blocks -- none
// of those belong here. Every Work Type (Assessment, Question,
// Analysis, Deduction, Definition, Demonstration) fits the same mold
// Text and List already do (nothing but its own starting text), so
// they all join this form rather than getting a separate creation
// flow. List items created here are plain text only -- no checkbox/
// number/date/confidence at creation -- matching the same scope line
// the "+ Add item" control already draws; a Work block likewise starts
// with just its statement, rationale/confidence set afterward on the
// block itself. WORK_TYPE_STARTER_PROMPTS is the one place a new Work
// Type's starting-text placeholder needs adding -- nothing else in
// this form is type-specific.
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

// The starting-text placeholder for each Work Type -- everything else
// about adding one here is identical, so this is the only thing a new
// Work Type needs added to this form.
const WORK_TYPE_STARTER_PROMPTS = {
  assessment: 'The assessment',
  question: 'The question',
  analysis: 'The analysis',
  deduction: 'The deduction',
  definition: 'The term',
  demonstration: 'The demonstration',
};

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
    } else {
      // Any Work Type -- all of them start with just a statement;
      // rationale/confidence are set afterward on the block itself.
      onAdd({ type, content: { statement: text.trim(), rationale: '', confidence: 'tentative' }, properties });
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
          <option value="text">Text</option>
          <option value="list">List</option>
          <option value="assessment">Assessment</option>
          <option value="question">Question</option>
          <option value="analysis">Analysis</option>
          <option value="deduction">Deduction</option>
          <option value="definition">Definition</option>
          <option value="demonstration">Demonstration</option>
        </select>
      </label>
      <br />
      {type !== 'list' ? (
        <textarea
          value={text}
          placeholder={
            type === 'text'
              ? 'Starting text (can be left blank)'
              : `${WORK_TYPE_STARTER_PROMPTS[type]} (can be left blank)`
          }
          rows={2}
          style={{ width: '100%', marginTop: '6px' }}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <>
          <input
            type="text"
            value={laneLabel}
            placeholder="List heading (optional)"
            style={{ width: '100%', marginTop: '6px' }}
            onChange={(event) => setLaneLabel(event.target.value)}
          />
          <textarea
            value={itemLines}
            placeholder={'Starting items, one per line (optional)'}
            rows={3}
            style={{ width: '100%', marginTop: '6px' }}
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
