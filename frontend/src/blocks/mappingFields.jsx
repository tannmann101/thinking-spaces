// The click-to-edit text field shared by the three Mapping Tools. Split
// out into its own module for the same reason textLinks.jsx was: all
// three Tools need identical inline-edit behaviour, and three copies of
// it would drift apart the first time one of them got a fix.
//
// Deliberately just this one field. The Tools lay out and label their
// own rows themselves, because a word's sense-shift, a rendering of a
// referent, and a component of a model read differently even though
// they're all edited the same way.

import { useState } from 'react';

function EditableText({ value, editable, placeholder, className = '', onSave, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  async function finish() {
    setEditing(false);
    if (draft === (value || '')) return;
    await onSave(draft.trim());
  }

  if (editing) {
    const shared = {
      value: draft,
      autoFocus: true,
      className: `${className} field-inherit-font`.trim(),
      onChange: (event) => setDraft(event.target.value),
      onBlur: finish,
    };
    // Enter commits a single-line field; in a multiline one it has to
    // stay a newline, so those commit on blur only.
    return multiline ? (
      <textarea {...shared} rows={2} />
    ) : (
      <input type="text" {...shared} onKeyDown={(event) => event.key === 'Enter' && finish()} />
    );
  }

  return (
    <button
      type="button"
      className={`${className}${editable ? ' editable' : ''}`.trim()}
      disabled={!editable}
      onClick={() => {
        setDraft(value || '');
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}

export default EditableText;
