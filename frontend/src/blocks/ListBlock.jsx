// Renders one List block: an ordered set of items. Text, number, and
// date are click-to-edit like Text blocks; checkbox toggles instantly;
// confidence cycles solid -> tentative -> questioned on click, with no
// separate edit mode -- per the Tools & Resources doc: "a single tap
// on the marker cycles through the three states in place, no dialog."
//
// Only properties an item already carries are editable here. Adding a
// property to an item that doesn't have one yet is a different, bigger
// feature (choosing which property to add) and isn't in scope.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';

const CONFIDENCE_CYCLE = ['solid', 'tentative', 'questioned'];

function ListBlock({ block }) {
  const editable = Boolean(block.id);
  const [items, setItems] = useState(block.content.items || []);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [draft, setDraft] = useState('');

  async function saveItems(newItems) {
    setItems(newItems);
    if (!editable) return;
    await updateBlockContent(block.id, { ...block.content, items: newItems });
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

  return (
    <ol>
      {items.map((item) => (
        <li key={item.id}>
          {typeof item.checkbox === 'boolean' && (
            <input
              type="checkbox"
              checked={item.checkbox}
              disabled={!editable}
              onChange={() => toggleCheckbox(item)}
            />
          )}{' '}
          {editableField(item, 'text', item.text)}
          {typeof item.number === 'number' && <> — number: {editableField(item, 'number', item.number, 'number')}</>}
          {item.date && <> — date: {editableField(item, 'date', item.date, 'date')}</>}
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
  );
}

export default ListBlock;
