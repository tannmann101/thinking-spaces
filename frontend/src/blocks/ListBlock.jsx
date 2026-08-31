// Renders one List block: an ordered set of items. Text, number, date,
// and reviewBy are click-to-edit like Text blocks; checkbox toggles
// instantly; confidence cycles questioned -> tentative -> moderate ->
// solid -> certain on
// click, with no separate edit mode -- per the Tools & Resources doc:
// "a single tap on the marker cycles through the three states in
// place, no dialog." flagged (load-bearing) toggles like a checkbox.
// Move-up/down buttons reorder items -- position in the array doubles
// as priority order, so no separate rank number is needed.
//
// Only properties an item already carries are editable here. Adding a
// *new* property to an existing item is still out of scope -- but "+
// Add item" below lets the list grow, which the Timeline/Ledger/
// Milestone-style Templates need to actually be usable over time.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { CONFIDENCE_CYCLE, buildNewItem } from './listItems.js';

function ListBlock({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const isSkeletonLane = Boolean(block.properties?.skeletonLane);
  const [items, setItems] = useState(block.content.items || []);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [draft, setDraft] = useState('');
  const [newItemText, setNewItemText] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(block.content.laneLabel || '');

  // Any Views rendered alongside this block (Progress, Ledger, ...)
  // read the `block` prop SpacePage already fetched, not this
  // component's own `items` state -- so without telling SpacePage to
  // refetch, a View sitting right next to this list would keep
  // showing stale counts after an edit here.
  async function saveItems(newItems) {
    setItems(newItems);
    if (!editable) return;
    await updateBlockContent(block.id, { ...block.content, items: newItems });
    onBlocksChanged?.();
  }

  function addItem(event) {
    event.preventDefault();
    if (!newItemText.trim()) return;
    saveItems([...items, buildNewItem(newItemText.trim(), items, isSkeletonLane)]);
    setNewItemText('');
  }

  function moveItem(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    saveItems(newItems);
  }

  // Items could be added and reordered but never removed -- a real gap
  // for a workshop, where getting something wrong or obsolete should be
  // as easy to undo as it was to add. Lower-stakes than removing a
  // whole block (no confirm dialog), same reasoning "+ Add item" itself
  // has no confirm.
  function removeItem(index) {
    saveItems(items.filter((_, i) => i !== index));
  }

  function startEditingField(item, field, initialValue) {
    if (!editable) return;
    setDraft(initialValue);
    setEditingField({ itemId: item.id, field });
  }

  function finishEditingField() {
    if (!editingField) return;
    const { itemId, field } = editingField;
    setEditingField(null);
    const newItems = items.map((item) => {
      if (item.id !== itemId) return item;
      if (field === 'number') {
        const parsed = Number(draft);
        return { ...item, number: Number.isNaN(parsed) ? item.number : parsed };
      }
      return { ...item, [field]: draft };
    });
    saveItems(newItems);
  }

  function toggleCheckbox(item) {
    if (!editable) return;
    saveItems(items.map((it) => (it.id === item.id ? { ...it, checkbox: !it.checkbox } : it)));
  }

  function toggleFlagged(item) {
    if (!editable) return;
    saveItems(items.map((it) => (it.id === item.id ? { ...it, flagged: !it.flagged } : it)));
  }

  function cycleConfidence(item) {
    if (!editable) return;
    const nextIndex = (CONFIDENCE_CYCLE.indexOf(item.confidence) + 1) % CONFIDENCE_CYCLE.length;
    const next = CONFIDENCE_CYCLE[nextIndex];
    saveItems(items.map((it) => (it.id === item.id ? { ...it, confidence: next } : it)));
  }

  // The heading itself was the one thing on a List block with no edit
  // surface at all -- items could be added/removed/reordered, but a
  // Ledger you renamed in your head as "Budget" still said "Ledger"
  // forever. Same click-to-edit pattern as everything else here.
  async function finishEditingLabel() {
    setEditingLabel(false);
    if (labelDraft === (block.content.laneLabel || '')) return;
    if (!editable) return;
    await updateBlockContent(block.id, { ...block.content, laneLabel: labelDraft });
    onBlocksChanged?.();
  }

  function editableField(item, field, value, inputType = 'text') {
    const isEditingThis = editingField?.itemId === item.id && editingField.field === field;
    if (isEditingThis) {
      return (
        <input
          type={inputType}
          value={draft}
          autoFocus
          style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishEditingField}
          onKeyDown={(event) => event.key === 'Enter' && finishEditingField()}
        />
      );
    }
    return (
      <span
        className={editable ? 'editable' : undefined}
        onClick={() => startEditingField(item, field, String(value))}
      >
        {value}
      </span>
    );
  }

  const laneLabel = block.content.laneLabel;

  return (
    <div className="list-block">
      {editingLabel && (
        <input
          type="text"
          value={labelDraft}
          autoFocus
          style={{ fontFamily: 'inherit', fontWeight: 500 }}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={finishEditingLabel}
          onKeyDown={(event) => event.key === 'Enter' && finishEditingLabel()}
        />
      )}
      {!editingLabel && (laneLabel || editable) && (
        <h4
          className={editable ? 'editable' : undefined}
          onClick={() => {
            if (!editable) return;
            setLabelDraft(laneLabel || '');
            setEditingLabel(true);
          }}
        >
          {laneLabel || '(add a heading)'}
        </h4>
      )}
      {laneLabel && items.length === 0 && <p>(empty)</p>}
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            {editable && (
              <span className="list-item-controls">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  title="Move up (higher priority)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  title="Move down (lower priority)"
                >
                  ▼
                </button>
                <button type="button" onClick={() => removeItem(index)} title="Remove item">
                  ✕
                </button>
              </span>
            )}{' '}
            {typeof item.flagged === 'boolean' && (
              <span
                className={editable ? 'editable-toggle' : undefined}
                onClick={() => toggleFlagged(item)}
                title={editable ? 'Load-bearing: if this is wrong, a lot else changes' : undefined}
              >
                {item.flagged ? '⚑' : '⚐'}
              </span>
            )}{' '}
            {typeof item.checkbox === 'boolean' && (
              <input
                type="checkbox"
                checked={item.checkbox}
                disabled={!editable}
                onChange={() => toggleCheckbox(item)}
              />
            )}{' '}
            {editableField(item, 'text', item.text)}
            {typeof item.number === 'number' && (
              <> — number: {editableField(item, 'number', item.number, 'number')}</>
            )}
            {item.date && <> — date: {editableField(item, 'date', item.date, 'date')}</>}
            {item.reviewBy && (
              <> — review by: {editableField(item, 'reviewBy', item.reviewBy, 'date')}</>
            )}
            {item.confidence && (
              <>
                {' — confidence: '}
                <span
                  className={editable ? 'editable-toggle' : undefined}
                  onClick={() => cycleConfidence(item)}
                  title={editable ? 'Click to cycle: questioned -> tentative -> moderate -> solid -> certain' : undefined}
                >
                  {item.confidence}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <form onSubmit={addItem} className="add-item-row">
          <input
            type="text"
            value={newItemText}
            placeholder="+ Add item"
            onChange={(event) => setNewItemText(event.target.value)}
          />
          <button type="submit" className="btn" disabled={!newItemText.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}

export default ListBlock;
