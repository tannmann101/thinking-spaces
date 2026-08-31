// Shared implementation behind every "Work" Tool -- a real, distinct
// Tool per kind of thinking-act (judge, inquire, and whatever gets
// added later), not a generic Text block with a label. Every kind
// shares one underlying shape ({statement, support, confidence}) so
// Synthesis can treat them uniformly, but each kind still gets its own
// registry entry, name, and catalog demo (see AssessmentBlock.jsx /
// QuestionBlock.jsx, thin wrappers that just name the two text fields
// for their own kind and pass everything else through here) -- the
// same "shared skeleton, distinct surface" reasoning already used for
// how a List's shape is inferred rather than duplicated per Tool.
//
// `support` was originally a single `rationale` prose blob; it's now a
// list of discrete points, for "surgical" precision -- each point is
// either its own short free-text claim, or a link to an existing claim
// elsewhere (another Work block's statement, or a Skeleton lane item),
// resolved live rather than copied -- the same pattern Tensions'
// statementA/statementB pointers already established in ListWorkshop.
// A block created before this redesign may still be on the old
// {rationale} shape; normalizeWorkContent in backend/src/db/queries.js
// upgrades it on the way out, same approach normalizeTextContent
// already takes for Text blocks, so this component only ever sees the
// current shape.
//
// Confidence reuses the exact CONFIDENCE_LEVELS scale every List item
// already uses, rather than inventing a separate scale for Work.

import { useEffect, useState } from 'react';
import { getBlocksForSpace, updateBlockContent } from '../api.js';
import { CONFIDENCE_LEVELS } from '../registry/blocks.js';

// Mirrors backend/src/db/queries.js's WORK_TYPES -- the frontend and
// backend are separate bundles, so this can't be a shared import, only
// a matching literal (same reasoning as SKELETON_LANE_LABELS in
// registry/skeleton.js mirroring the backend's SKELETON_LANES). Used
// only to find candidate Work blocks in the same Space a support point
// could link to.
const WORK_TYPES = [
  'assessment',
  'question',
  'analysis',
  'deduction',
  'definition',
  'demonstration',
  'insight',
  'implication',
  'hypothesis',
  'objection',
];

// A Tension pairs claims from these three Skeleton lanes; the same set
// makes sense as link candidates here. Mirrors CLAIM_LANE_KEYS in
// ListWorkshop.jsx and backend/src/routes/skeleton.js.
const CLAIM_LANE_KEYS = ['premises', 'evidence', 'open-questions'];

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Resolves a support point's {blockId, itemId} pointer against the
// Space's already-fetched blocks -- live, not snapshotted, so editing
// the source claim updates every place that links to it automatically.
// itemId is null when the pointer targets a whole Work block (its own
// statement is the claim); set when it targets a specific Skeleton
// lane item, same as a Tension's own pointers.
function resolvePointer(pointer, spaceBlocks) {
  if (!pointer || !spaceBlocks) return null;
  const block = spaceBlocks.find((b) => b.id === pointer.blockId);
  if (!block) return null;
  if (pointer.itemId) {
    const item = block.content?.items?.find((i) => i.id === pointer.itemId);
    return item ? { text: item.text } : null;
  }
  return block.content?.statement ? { text: block.content.statement } : null;
}

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

// The "+ Link a claim" picker: candidates are every other Work block's
// statement, plus every item in a claim-bearing Skeleton lane, in the
// same Space. A single pick, unlike Tensions' pair-picker, since a
// support point links to just one claim.
function SupportLinker({ spaceBlocks, excludeBlockId, onLink, onCancel }) {
  const candidates = [
    ...(spaceBlocks || [])
      .filter((b) => WORK_TYPES.includes(b.type) && b.id !== excludeBlockId && b.content.statement)
      .map((b) => ({ blockId: b.id, itemId: null, text: b.content.statement, source: capitalize(b.type) })),
    ...(spaceBlocks || [])
      .filter((b) => CLAIM_LANE_KEYS.includes(b.properties?.skeletonLane))
      .flatMap((b) =>
        (b.content.items || []).map((item) => ({
          blockId: b.id,
          itemId: item.id,
          text: item.text,
          source: b.content.laneLabel,
        }))
      ),
  ];

  return (
    <div className="work-block-linker">
      {candidates.length === 0 && <p className="list-workshop-empty">No other claims yet to link to.</p>}
      <ul className="checkbox-list">
        {candidates.map((candidate) => (
          <li key={`${candidate.blockId}-${candidate.itemId || ''}`}>
            <button
              type="button"
              className="btn-ghost-small"
              onClick={() => onLink({ blockId: candidate.blockId, itemId: candidate.itemId })}
            >
              {candidate.text}
            </button>{' '}
            <span className="tension-builder-lane">({candidate.source})</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost-small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function SupportItem({ item, spaceBlocks, editable, onSaveText, onRemove }) {
  if (item.pointer) {
    const resolved = resolvePointer(item.pointer, spaceBlocks);
    return (
      <li className="work-block-support-item work-block-support-pointer">
        <span className="work-block-support-link-icon" title="Linked to another claim">
          ↦
        </span>
        {resolved ? resolved.text : <em>(linked claim removed)</em>}
        {editable && (
          <button type="button" className="work-block-support-remove" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </li>
    );
  }
  return (
    <li className="work-block-support-item">
      <EditableField editable={editable} value={item.text || ''} placeholder="(empty)" onSave={onSaveText} />
      {editable && (
        <button type="button" className="work-block-support-remove" onClick={onRemove} title="Remove">
          ✕
        </button>
      )}
    </li>
  );
}

function WorkBlock({ block, onBlocksChanged, statementLabel, supportLabel }) {
  const editable = Boolean(block.id);
  const [content, setContent] = useState(block.content);
  const [spaceBlocks, setSpaceBlocks] = useState(null);
  const [newSupportText, setNewSupportText] = useState('');
  const [linking, setLinking] = useState(false);

  // Needed both to resolve any existing pointer support points and to
  // offer link candidates -- fetched once per block instance, same
  // eagerness ListWorkshop already applies for Tensions.
  useEffect(() => {
    if (editable) getBlocksForSpace(block.space_id).then(setSpaceBlocks);
  }, [editable, block.space_id]);

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

  const support = content.support || [];

  function addFreeTextSupport(event) {
    event.preventDefault();
    if (!newSupportText.trim()) return;
    save({ ...content, support: [...support, { id: crypto.randomUUID(), text: newSupportText.trim() }] });
    setNewSupportText('');
  }

  function addLinkedSupport(pointer) {
    setLinking(false);
    save({ ...content, support: [...support, { id: crypto.randomUUID(), pointer }] });
  }

  function saveSupportText(itemId, text) {
    save({ ...content, support: support.map((item) => (item.id === itemId ? { ...item, text } : item)) });
  }

  function removeSupportItem(itemId) {
    save({ ...content, support: support.filter((item) => item.id !== itemId) });
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

      <div className="work-block-support">
        <span className="work-block-field-label">{supportLabel}:</span>
        {support.length === 0 && <p className="list-workshop-empty">(nothing added yet)</p>}
        {support.length > 0 && (
          <ul className="work-block-support-list">
            {support.map((item) => (
              <SupportItem
                key={item.id}
                item={item}
                spaceBlocks={spaceBlocks}
                editable={editable}
                onSaveText={(text) => saveSupportText(item.id, text)}
                onRemove={() => removeSupportItem(item.id)}
              />
            ))}
          </ul>
        )}
        {editable && !linking && (
          <form onSubmit={addFreeTextSupport} className="add-item-row">
            <input
              type="text"
              value={newSupportText}
              placeholder="+ Add a point"
              onChange={(event) => setNewSupportText(event.target.value)}
            />
            <button type="submit" className="btn-ghost-small" disabled={!newSupportText.trim()}>
              Add
            </button>
            <button type="button" className="btn-ghost-small" onClick={() => setLinking(true)}>
              🔗 Link a claim
            </button>
          </form>
        )}
        {editable && linking && (
          <SupportLinker
            spaceBlocks={spaceBlocks}
            excludeBlockId={block.id}
            onLink={addLinkedSupport}
            onCancel={() => setLinking(false)}
          />
        )}
      </div>

      <p className="work-block-confidence">
        Confidence:{' '}
        <span
          className={editable ? 'editable-toggle' : undefined}
          onClick={cycleConfidence}
          title={editable ? 'Click to cycle: questioned -> tentative -> moderate -> solid -> certain' : undefined}
        >
          {content.confidence || 'tentative'}
        </span>
      </p>
    </div>
  );
}

export default WorkBlock;
