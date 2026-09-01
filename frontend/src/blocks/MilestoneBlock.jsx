// Renders one Milestone block: a checkpoint with a target date and its
// own reached/not-yet-reached state -- a real Tool (see
// registry/blocks.js's `family: 'time'`) rather than a List item
// wearing a date and a checkbox, since a checkpoint's own operational
// state (reached, and when) deserves the same first-class treatment
// "Work" gave individual acts of thinking.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

// onSave lets a parent override where an edit goes -- a Comparison
// side, or the Tools catalog's own interactive demo (see ToolsPage.jsx's
// DemoBlock) -- same pattern every other simple Block already follows
// (see ReferenceBlock.jsx). onBlocksChanged tells the page to refetch
// after a standalone save.
function MilestoneBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { label, targetDate, reached, reachedAt, note } = block.content;

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label || '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');

  async function persist(patch) {
    const newContent = {
      label,
      targetDate: targetDate || null,
      reached: !!reached,
      reachedAt: reachedAt || null,
      note: note || '',
      ...patch,
    };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  async function finishLabel() {
    setEditingLabel(false);
    if (labelDraft === (label || '')) return;
    await persist({ label: labelDraft.trim() });
  }

  async function finishNote() {
    setEditingNote(false);
    if (noteDraft === (note || '')) return;
    await persist({ note: noteDraft.trim() });
  }

  async function toggleReached() {
    if (!editable) return;
    const next = !reached;
    await persist({ reached: next, reachedAt: next ? todayString() : null });
  }

  const isOverdue = !reached && targetDate && targetDate < todayString();

  return (
    <div
      className={`milestone-block${isOverdue ? ' milestone-overdue' : ''}${
        reached ? ' milestone-reached' : ''
      }`}
    >
      <p className="milestone-label-row">
        <input
          type="checkbox"
          checked={!!reached}
          disabled={!editable}
          onChange={toggleReached}
          title={reached ? `Reached${reachedAt ? ` on ${reachedAt}` : ''}` : 'Mark as reached'}
        />{' '}
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            autoFocus
            className="inline-title-field"
            onChange={(event) => setLabelDraft(event.target.value)}
            onBlur={finishLabel}
            onKeyDown={(event) => event.key === 'Enter' && finishLabel()}
          />
        ) : (
          <span
            className={editable ? 'editable' : undefined}
            onClick={() => {
              if (!editable) return;
              setLabelDraft(label || '');
              setEditingLabel(true);
            }}
          >
            {label || '(untitled milestone -- click to name it)'}
          </span>
        )}
      </p>
      <p className="milestone-meta-row">
        Target:{' '}
        <input
          type="date"
          value={targetDate || ''}
          disabled={!editable}
          onChange={(event) => persist({ targetDate: event.target.value || null })}
        />
        {isOverdue && <span className="overdue-badge">Overdue</span>}
        {reached && <span className="milestone-reached-badge">Reached{reachedAt ? ` ${reachedAt}` : ''}</span>}
      </p>
      {editingNote ? (
        <textarea
          value={noteDraft}
          autoFocus
          rows={2}
          className="field-full"
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={finishNote}
        />
      ) : (
        <p
          className={editable ? 'editable milestone-note' : 'milestone-note'}
          onClick={() => {
            if (!editable) return;
            setNoteDraft(note || '');
            setEditingNote(true);
          }}
        >
          {note || (editable ? '(add a note)' : '')}
        </p>
      )}
    </div>
  );
}

export default MilestoneBlock;
