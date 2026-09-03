// Renders one Concept Map block: a referent, and every rendering of it
// in circulation -- the Tool the Word-Concept Mapping Workspace is built
// around (see registry/workspaceKinds.js).
//
// The point of it is diagnostic, not descriptive. A misunderstanding
// between two people usually isn't a disagreement about the thing; it's
// two different renderings of the same referent, each taken as the thing
// itself. So the referent gets stated once, at the top, and every
// rendering below is marked by how far it actually sits from it. The
// divergent ones, read together, are the shape of the misunderstanding.
//
// Alignment is a three-value judgement rather than free text so the
// divergences can be seen at a glance instead of read for -- the same
// reasoning the confidence scale is a fixed set of words.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { addRow, updateRow, removeRow, moveRow, ALIGNMENTS } from './mappingRows.js';
import EditableText from './mappingFields.jsx';

function ConceptMapBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { referent = '', gloss = '', renderings = [] } = block.content;

  const [newLabel, setNewLabel] = useState('');
  const [newSense, setNewSense] = useState('');

  async function persist(patch) {
    const newContent = { referent, gloss, renderings, ...patch };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await persist({
      renderings: addRow(renderings, {
        label: newLabel.trim(),
        sense: newSense.trim(),
        alignment: 'partial',
        note: '',
      }),
    });
    setNewLabel('');
    setNewSense('');
  }

  async function cycleAlignment(entry) {
    if (!editable) return;
    const index = ALIGNMENTS.findIndex((a) => a.key === entry.alignment);
    const next = ALIGNMENTS[(index + 1) % ALIGNMENTS.length].key;
    await persist({ renderings: updateRow(renderings, entry.id, { alignment: next }) });
  }

  const divergentCount = renderings.filter((entry) => entry.alignment === 'divergent').length;

  return (
    <div className="concept-map-block">
      <div className="concept-map-referent">
        <p className="concept-map-label">Referent</p>
        <EditableText
          value={referent}
          editable={editable}
          placeholder="(what is actually being referred to -- click to name it)"
          className="concept-map-referent-name"
          onSave={(value) => persist({ referent: value })}
        />
        <EditableText
          value={gloss}
          editable={editable}
          placeholder="(its proper rendering, as best you can state it -- click to add)"
          className="concept-map-gloss"
          multiline
          onSave={(value) => persist({ gloss: value })}
        />
      </div>

      {renderings.length === 0 && (
        <p className="empty-note">
          No renderings recorded yet. Add each way this gets referred to -- your own included -- then mark how
          far each one actually sits from the referent above.
        </p>
      )}

      {renderings.length > 0 && (
        <>
          <p className="concept-map-label">
            Renderings in circulation
            {divergentCount > 0 && (
              <span className="concept-map-divergent-count">
                {' '}
                &mdash; {divergentCount} pointing elsewhere
              </span>
            )}
          </p>
          <ul className="concept-map-renderings">
            {renderings.map((entry) => (
              <li key={entry.id} className="concept-map-rendering" data-alignment={entry.alignment}>
                <button
                  type="button"
                  className="concept-map-alignment"
                  disabled={!editable}
                  title={ALIGNMENTS.find((a) => a.key === entry.alignment)?.hint || 'Set alignment'}
                  onClick={() => cycleAlignment(entry)}
                >
                  {ALIGNMENTS.find((a) => a.key === entry.alignment)?.label || 'Partial'}
                </button>
                <EditableText
                  value={entry.label}
                  editable={editable}
                  placeholder="(the word or phrase used)"
                  className="concept-map-rendering-label"
                  onSave={(value) => persist({ renderings: updateRow(renderings, entry.id, { label: value }) })}
                />
                <EditableText
                  value={entry.sense}
                  editable={editable}
                  placeholder="(what it's taken to mean -- click to add)"
                  className="concept-map-rendering-sense"
                  onSave={(value) => persist({ renderings: updateRow(renderings, entry.id, { sense: value }) })}
                />
                <EditableText
                  value={entry.note}
                  editable={editable}
                  placeholder="(where the slippage happens -- click to add)"
                  className="concept-map-rendering-note"
                  multiline
                  onSave={(value) => persist({ renderings: updateRow(renderings, entry.id, { note: value }) })}
                />
                {editable && (
                  <span className="concept-map-controls">
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ renderings: moveRow(renderings, entry.id, -1) })}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ renderings: moveRow(renderings, entry.id, 1) })}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ renderings: removeRow(renderings, entry.id) })}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {editable && (
        <div className="concept-map-add">
          <input
            type="text"
            value={newLabel}
            placeholder="The word or phrase used"
            className="field-width-40"
            onChange={(event) => setNewLabel(event.target.value)}
          />{' '}
          <input
            type="text"
            value={newSense}
            placeholder="What it's taken to mean"
            className="field-width-55"
            onChange={(event) => setNewSense(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />{' '}
          <button type="button" className="btn-ghost-small" onClick={handleAdd} disabled={!newLabel.trim()}>
            + Add a rendering
          </button>
        </div>
      )}
    </div>
  );
}

export default ConceptMapBlock;
