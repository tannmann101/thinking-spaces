// Renders one List block: an ordered set of items. Text, number, date,
// and reviewBy are click-to-edit like Text blocks; checkbox toggles
// instantly; confidence cycles solid -> tentative -> questioned on
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

const CONFIDENCE_CYCLE = ['solid', 'tentative', 'questioned'];

// A new item matches whatever shape this list's items already use: a
// Ledger's items all carry `number`, so a new line should too. A
// Skeleton lane (Premises/Evidence/Open Questions/Tensions) always
// gets `confidence`, matching what shorthand promotion already gives
// promoted items, even before this list has any items yet. Otherwise
// (a plain, empty list) a new item is just text.
function buildNewItem(text, items, isSkeletonLane) {
  const item = { id: crypto.randomUUID(), text };
  const sample = items[0];
  if (isSkeletonLane || sample?.confidence) item.confidence = 'tentative';
  if (sample && typeof sample.checkbox === 'boolean') item.checkbox = false;
  if (sample && typeof sample.number === 'number') item.number = 0;
  if (sample?.date) item.date = new Date().toISOString().slice(0, 10);
  if (sample?.reviewBy) item.reviewBy = new Date().toISOString().slice(0, 10);
  if (sample && typeof sample.flagged === 'boolean') item.flagged = false;
  return item;
}

function ListBlock({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const isSkeletonLane = Boolean(block.properties?.skeletonLane);
  const [items, setItems] = useState(block.content.items || []);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [draft, setDraft] = useState('');
  const [newItemText, setNewItemText] = useState('');

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
    <div>
      {laneLabel && <h4>{laneLabel}</h4>}
      {laneLabel && items.length === 0 && <p>(empty)</p>}
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            {editable && (
              <span style={{ fontFamily: 'monospace' }}>
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
                  title={editable ? 'Click to cycle: solid -> tentative -> questioned' : undefined}
                >
                  {item.confidence}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <form onSubmit={addItem} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={newItemText}
            placeholder="+ Add item"
            style={{ flex: 1 }}
            onChange={(event) => setNewItemText(event.target.value)}
          />
          <button type="submit" disabled={!newItemText.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}

export default ListBlock;
