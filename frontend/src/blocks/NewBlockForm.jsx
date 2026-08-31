// A minimal "add a block" form, shared between the Template editor
// (where it appends to a draft block_arrangement) and a live Space
// (where it POSTs immediately) -- what a new Text or List block needs
// at creation is the same question in both places.
//
// Deliberately limited to Text and List: those two cover everything
// the five built-in Templates actually use apart from one Media block
// and a couple of Reference/Comparison blocks, and both of those need
// real external input (a target Space, an image URL) that doesn't fit
// a quick "+ Add Block" form. List items created here are plain text
// only -- no checkbox/number/date/confidence at creation -- matching
// the same scope line the "+ Add item" control already draws.

import { useState } from 'react';

function NewBlockForm({ onAdd }) {
  const [type, setType] = useState('text');
  const [text, setText] = useState('');
  const [laneLabel, setLaneLabel] = useState('');
  const [itemLines, setItemLines] = useState('');

  // Not a <form> -- this gets rendered inside the Template editor's own
  // <form> (and, on a live Space, right alongside one), and nested
  // <form> elements are invalid HTML that Chromium resolves by routing
  // the inner submit button's click to the outer form instead. A plain
  // button + onClick sidesteps that entirely.
  function handleSubmit() {
    if (type === 'text') {
      onAdd({ type: 'text', content: { tag: null, text }, properties: {} });
    } else {
      const items = itemLines
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ id: crypto.randomUUID(), text: line }));
      onAdd({ type: 'list', content: { laneLabel: laneLabel.trim(), items }, properties: {} });
    }
    setText('');
    setLaneLabel('');
    setItemLines('');
  }

  return (
    <div className="new-block-form">
      <label>
        Block type:{' '}
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="text">Text</option>
          <option value="list">List</option>
        </select>
      </label>
      <br />
      {type === 'text' ? (
        <textarea
          value={text}
          placeholder="Starting text (can be left blank)"
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
      <p>
        <button type="button" className="btn" onClick={handleSubmit}>
          + Add Block
        </button>
      </p>
    </div>
  );
}

export default NewBlockForm;
