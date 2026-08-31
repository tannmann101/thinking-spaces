// The List Workshop: what a List block becomes inside a Workspace,
// instead of the compact, single-line-per-item feed row it is in the
// ordinary feed (see ListBlock.jsx). Same underlying data and the same
// save path (updateBlockContent) -- what changes is the environment:
// each item gets its own card instead of a run-on inline line, real
// drag-and-drop reordering instead of up/down buttons, and a shape
// picker for the very first item on an empty list (previously the only
// way a list ever got a checkbox/confidence/date/number field was to
// already have one item with that shape -- a genuine gap, not a
// deliberate restriction, on a list that starts empty).

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { CONFIDENCE_CYCLE, buildNewItem } from './listItems.js';

const SHAPE_FIELDS = [
  { key: 'checkbox', label: 'checkbox' },
  { key: 'confidence', label: 'confidence' },
  { key: 'date', label: 'date' },
  { key: 'reviewBy', label: 'review date' },
  { key: 'number', label: 'number' },
];

function ListWorkshop({ block, onBlocksChanged }) {
  const editable = Boolean(block.id);
  const isSkeletonLane = Boolean(block.properties?.skeletonLane);
  const [items, setItems] = useState(block.content.items || []);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [draft, setDraft] = useState('');
  const [newItemText, setNewItemText] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(block.content.laneLabel || '');
  const [firstItemShape, setFirstItemShape] = useState([]); // field keys, only used while items.length === 0
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Same reasoning as ListBlock: Views computed over this list (Progress,
  // Ledger, Streak) read the `block` prop SpacePage/WorkspacePage already
  // fetched, so a save here has to trigger a refetch or they'd keep
  // showing stale counts.
  async function saveItems(newItems) {
    setItems(newItems);
    if (!editable) return;
    await updateBlockContent(block.id, { ...block.content, items: newItems });
    onBlocksChanged?.();
  }

  function toggleShapeField(key) {
    setFirstItemShape((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  }

  function addItem(event) {
    event.preventDefault();
    if (!newItemText.trim()) return;
    const shapeOverride =
      items.length === 0 ? Object.fromEntries(firstItemShape.map((key) => [key, true])) : null;
    saveItems([...items, buildNewItem(newItemText.trim(), items, isSkeletonLane, shapeOverride)]);
    setNewItemText('');
    setFirstItemShape([]);
  }

  function removeItem(index) {
    saveItems(items.filter((_, i) => i !== index));
  }

  // Real drag-and-drop reordering -- native HTML5 DnD rather than a
  // hand-rolled pointer tracker, since a plain "drop this above/below
  // that" reorder doesn't need the freeform physics the Graph's own
  // dragging does. Dropping on itself is a no-op.
  function handleDrop(targetIndex) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newItems = [...items];
    const [moved] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, moved);
    saveItems(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
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
          className="list-workshop-field-input"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishEditingField}
          onKeyDown={(event) => event.key === 'Enter' && finishEditingField()}
        />
      );
    }
    return (
      <span className={editable ? 'editable' : undefined} onClick={() => startEditingField(item, field, String(value))}>
        {value}
      </span>
    );
  }

  const laneLabel = block.content.laneLabel;

  return (
    <div className="list-workshop">
      {editingLabel ? (
        <input
          type="text"
          value={labelDraft}
          autoFocus
          className="list-workshop-heading-input"
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={finishEditingLabel}
          onKeyDown={(event) => event.key === 'Enter' && finishEditingLabel()}
        />
      ) : (
        (laneLabel || editable) && (
          <h3
            className={`list-workshop-heading${editable ? ' editable' : ''}`}
            onClick={() => {
              if (!editable) return;
              setLabelDraft(laneLabel || '');
              setEditingLabel(true);
            }}
          >
            {laneLabel || '(add a heading)'}
          </h3>
        )
      )}

      {items.length === 0 && <p className="list-workshop-empty">Nothing here yet.</p>}

      <ul className="list-workshop-items">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable={editable}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverIndex(index);
            }}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => {
              setDraggedIndex(null);
              setDragOverIndex(null);
            }}
            className={`list-workshop-item${draggedIndex === index ? ' dragging' : ''}${
              dragOverIndex === index && draggedIndex !== null && draggedIndex !== index ? ' drag-over' : ''
            }`}
          >
            <div className="list-workshop-item-main">
              {editable && (
                <span className="list-workshop-handle" title="Drag to reorder">
                  ⠿
                </span>
              )}
              {typeof item.flagged === 'boolean' && (
                <span
                  className={editable ? 'editable-toggle' : undefined}
                  onClick={() => toggleFlagged(item)}
                  title={editable ? 'Load-bearing: if this is wrong, a lot else changes' : undefined}
                >
                  {item.flagged ? '⚑' : '⚐'}
                </span>
              )}
              {typeof item.checkbox === 'boolean' && (
                <input type="checkbox" checked={item.checkbox} disabled={!editable} onChange={() => toggleCheckbox(item)} />
              )}
              <span className="list-workshop-item-text">{editableField(item, 'text', item.text)}</span>
              {editable && (
                <button type="button" className="list-workshop-remove" onClick={() => removeItem(index)} title="Remove item">
                  ✕
                </button>
              )}
            </div>
            {(typeof item.number === 'number' || item.date || item.reviewBy || item.confidence) && (
              <div className="list-workshop-item-meta">
                {typeof item.number === 'number' && (
                  <span className="list-workshop-meta-field">
                    number: {editableField(item, 'number', item.number, 'number')}
                  </span>
                )}
                {item.date && (
                  <span className="list-workshop-meta-field">date: {editableField(item, 'date', item.date, 'date')}</span>
                )}
                {item.reviewBy && (
                  <span className="list-workshop-meta-field">
                    review by: {editableField(item, 'reviewBy', item.reviewBy, 'date')}
                  </span>
                )}
                {item.confidence && (
                  <span
                    className="list-workshop-meta-field list-workshop-confidence"
                    onClick={() => cycleConfidence(item)}
                    title={editable ? 'Click to cycle: solid -> tentative -> questioned' : undefined}
                  >
                    {item.confidence}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <>
          {items.length === 0 && (
            <p className="list-workshop-shape-picker">
              What should each item track?{' '}
              {SHAPE_FIELDS.map(({ key, label }) => (
                <span
                  key={key}
                  className={`category-chip category-chip-toggle${firstItemShape.includes(key) ? ' category-chip-active' : ''}`}
                  onClick={() => toggleShapeField(key)}
                >
                  {label}
                </span>
              ))}
            </p>
          )}
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
        </>
      )}
    </div>
  );
}

export default ListWorkshop;
