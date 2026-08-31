// Shared implementation behind every "Work" Tool -- a real, distinct
// Tool per kind of thinking-act (judge, inquire, and whatever gets
// added later), not a generic Text block with a label. Every kind
// shares one underlying shape ({statement, rationale, confidence}) so
// Synthesis can treat them uniformly, but each kind still gets its own
// registry entry, name, and catalog demo (see AssessmentBlock.jsx /
// QuestionBlock.jsx, thin wrappers that just name the two text fields
// for their own kind and pass everything else through here) -- the
// same "shared skeleton, distinct surface" reasoning already used for
// how a List's shape is inferred rather than duplicated per Tool.
//
// Confidence reuses the exact solid/tentative/questioned cycle every
// List item already uses (CONFIDENCE_LEVELS), rather than inventing a
// fourth scale in the app.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { CONFIDENCE_LEVELS } from '../registry/blocks.js';

function EditableField({ editable, value, placeholder, multiline = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function finish() {
    setEditing(false);
    if (draft === value) return;
    await onSave(draft);
  }

  if (editing) {
    const Field = multiline ? 'textarea' : 'input';
    return (
      <Field
        {...(multiline ? { rows: 3 } : { type: 'text' })}
        value={draft}
        autoFocus
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit' }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => !multiline && event.key === 'Enter' && finish()}
      />
    );
  }
  return (
    <span
      className={editable ? 'editable' : undefined}
      onClick={() => {
        if (!editable) return;
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </span>
  );
}

function WorkBlock({ block, onBlocksChanged, statementLabel, rationaleLabel }) {
  const editable = Boolean(block.id);
  const [content, setContent] = useState(block.content);

  async function save(next) {
    setContent(next);
    if (!editable) return;
    await updateBlockContent(block.id, next);
    onBlocksChanged?.();
  }

  function cycleConfidence() {
    if (!editable) return;
    const nextIndex = (CONFIDENCE_LEVELS.indexOf(content.confidence) + 1) % CONFIDENCE_LEVELS.length;
    save({ ...content, confidence: CONFIDENCE_LEVELS[nextIndex] });
  }

  return (
    <div className="work-block">
      <p className="work-block-statement">
        <EditableField
          editable={editable}
          value={content.statement || ''}
          placeholder={`(add the ${statementLabel.toLowerCase()})`}
          onSave={(next) => save({ ...content, statement: next })}
        />
      </p>
      <p className="work-block-rationale">
        <span className="work-block-field-label">{rationaleLabel}: </span>
        <EditableField
          editable={editable}
          value={content.rationale || ''}
          placeholder="(add rationale)"
          multiline
          onSave={(next) => save({ ...content, rationale: next })}
        />
      </p>
      <p className="work-block-confidence">
        Confidence:{' '}
        <span
          className={editable ? 'editable-toggle' : undefined}
          onClick={cycleConfidence}
          title={editable ? 'Click to cycle: solid -> tentative -> questioned' : undefined}
        >
          {content.confidence || 'tentative'}
        </span>
      </p>
    </div>
  );
}

export default WorkBlock;
