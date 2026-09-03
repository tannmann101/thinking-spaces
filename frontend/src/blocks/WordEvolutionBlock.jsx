// Renders one Word Evolution block: a term, plus how its sense shifted
// over time -- the Tool the Etymology Workspace is built around (see
// registry/workspaceKinds.js). A real Tool rather than a List with
// dates typed into it, because each shift carries three distinct things
// (when, what it then meant, and what moved it) that a single line of
// list text flattens into prose you then have to re-read to parse.
//
// Order is manual, not sorted: a period here is free text the way people
// actually write it ("Old English", "c. 1650", "post-Enlightenment"),
// which no date parser handles honestly. Move up/down is the ordering.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { addRow, updateRow, removeRow, moveRow } from './mappingRows.js';
import EditableText from './mappingFields.jsx';

// onSave lets a parent override where an edit goes -- the Tools
// catalog's own interactive demo (see ToolsPage.jsx's DemoBlock) --
// same pattern every other Block already follows.
function WordEvolutionBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { term = '', senses = [] } = block.content;

  const [editingTerm, setEditingTerm] = useState(false);
  const [termDraft, setTermDraft] = useState(term);
  const [newPeriod, setNewPeriod] = useState('');
  const [newSense, setNewSense] = useState('');

  async function persist(patch) {
    const newContent = { term, senses, ...patch };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  async function finishTerm() {
    setEditingTerm(false);
    if (termDraft === term) return;
    await persist({ term: termDraft.trim() });
  }

  async function handleAdd() {
    if (!newSense.trim()) return;
    await persist({
      senses: addRow(senses, { period: newPeriod.trim(), sense: newSense.trim(), note: '' }),
    });
    setNewPeriod('');
    setNewSense('');
  }

  return (
    <div className="word-evolution-block">
      <p className="word-evolution-term-row">
        {editingTerm ? (
          <input
            type="text"
            value={termDraft}
            autoFocus
            className="inline-title-field"
            onChange={(event) => setTermDraft(event.target.value)}
            onBlur={finishTerm}
            onKeyDown={(event) => event.key === 'Enter' && finishTerm()}
          />
        ) : (
          <span
            className={`word-evolution-term${editable ? ' editable' : ''}`}
            onClick={() => {
              if (!editable) return;
              setTermDraft(term);
              setEditingTerm(true);
            }}
          >
            {term || '(name the word -- click to set it)'}
          </span>
        )}
      </p>

      {senses.length === 0 && (
        <p className="empty-note">
          No sense-shifts recorded yet. Add the earliest meaning you know of first, then work forward.
        </p>
      )}

      {senses.length > 0 && (
        <ol className="word-evolution-track">
          {senses.map((entry, index) => (
            <li key={entry.id} className="word-evolution-step">
              <span className="word-evolution-period">{entry.period || `Stage ${index + 1}`}</span>
              <EditableText
                value={entry.sense}
                editable={editable}
                placeholder="(what it meant then)"
                className="word-evolution-sense"
                onSave={(value) => persist({ senses: updateRow(senses, entry.id, { sense: value }) })}
              />
              <EditableText
                value={entry.note}
                editable={editable}
                placeholder="(what moved it -- click to add)"
                className="word-evolution-note"
                onSave={(value) => persist({ senses: updateRow(senses, entry.id, { note: value }) })}
              />
              {editable && (
                <span className="word-evolution-controls">
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => persist({ senses: moveRow(senses, entry.id, -1) })}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => persist({ senses: moveRow(senses, entry.id, 1) })}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => persist({ senses: removeRow(senses, entry.id) })}
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && (
        <div className="word-evolution-add">
          <input
            type="text"
            value={newPeriod}
            placeholder="When (e.g. Old English, c. 1650)"
            className="field-width-40"
            onChange={(event) => setNewPeriod(event.target.value)}
          />{' '}
          <input
            type="text"
            value={newSense}
            placeholder="What it meant then"
            className="field-width-55"
            onChange={(event) => setNewSense(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />{' '}
          <button type="button" className="btn-ghost-small" onClick={handleAdd} disabled={!newSense.trim()}>
            + Add a shift
          </button>
        </div>
      )}
    </div>
  );
}

export default WordEvolutionBlock;
