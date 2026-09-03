// Renders one Model block: a subject, the components it's built from,
// and how those components relate -- the Tool the Modeling Workspace is
// built around, and the one Worldview Assessment leans on to lay out
// what somebody must be holding for their view to hang together (see
// registry/workspaceKinds.js).
//
// A relation stores component *ids*, not names, and resolves each one
// fresh on every render -- so renaming a component updates every
// relation that mentions it, with no separate sync step. Same live
// resolution a Tension's statementA/statementB pointers and a Work
// item's linked support points already use.
//
// A relation whose component has since been removed renders as a plain
// "(removed)" rather than vanishing: silently dropping half a relation
// would quietly change what the model claims.

import { useState } from 'react';
import { updateBlockContent } from '../api.js';
import { addRow, updateRow, removeRow, moveRow } from './mappingRows.js';
import EditableText from './mappingFields.jsx';

function ModelBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { subject = '', components = [], relations = [] } = block.content;

  const [newComponent, setNewComponent] = useState('');
  const [relationFrom, setRelationFrom] = useState('');
  const [relationKind, setRelationKind] = useState('');
  const [relationTo, setRelationTo] = useState('');

  async function persist(patch) {
    const newContent = { subject, components, relations, ...patch };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  function componentName(id) {
    const found = components.find((component) => component.id === id);
    return found ? found.name : null;
  }

  async function handleAddComponent() {
    if (!newComponent.trim()) return;
    await persist({ components: addRow(components, { name: newComponent.trim(), role: '' }) });
    setNewComponent('');
  }

  async function handleAddRelation() {
    if (!relationFrom || !relationTo) return;
    await persist({
      relations: addRow(relations, {
        from: relationFrom,
        to: relationTo,
        kind: relationKind.trim() || 'relates to',
        note: '',
      }),
    });
    setRelationKind('');
  }

  // Removing a component deliberately leaves relations that mention it
  // in place -- they render as "(removed)" so the gap is visible and can
  // be repaired or deleted on purpose, the same way a deleted Workspace
  // leaves a stale id rather than silently rewriting blocks.
  async function handleRemoveComponent(id) {
    await persist({ components: removeRow(components, id) });
  }

  return (
    <div className="model-block">
      <p className="model-subject-row">
        <span className="model-label">Modeling</span>{' '}
        <EditableText
          value={subject}
          editable={editable}
          placeholder="(what is being modeled -- click to name it)"
          className="model-subject"
          onSave={(value) => persist({ subject: value })}
        />
      </p>

      <p className="model-label">Components</p>
      {components.length === 0 && (
        <p className="empty-note">
          Nothing in the model yet. Add the parts it's built from first -- relations between them come next.
        </p>
      )}
      {components.length > 0 && (
        <ul className="model-components">
          {components.map((component) => (
            <li key={component.id} className="model-component">
              <EditableText
                value={component.name}
                editable={editable}
                placeholder="(unnamed)"
                className="model-component-name"
                onSave={(value) => persist({ components: updateRow(components, component.id, { name: value }) })}
              />
              <EditableText
                value={component.role}
                editable={editable}
                placeholder="(what it does here -- click to add)"
                className="model-component-role"
                onSave={(value) => persist({ components: updateRow(components, component.id, { role: value }) })}
              />
              {editable && (
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() => handleRemoveComponent(component.id)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="model-add-component">
          <input
            type="text"
            value={newComponent}
            placeholder="Add a component"
            className="field-width-60"
            onChange={(event) => setNewComponent(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAddComponent()}
          />{' '}
          <button
            type="button"
            className="btn-ghost-small"
            onClick={handleAddComponent}
            disabled={!newComponent.trim()}
          >
            + Add component
          </button>
        </div>
      )}

      <p className="model-label">Relations</p>
      {relations.length === 0 && <p className="empty-note">No relations mapped yet.</p>}
      {relations.length > 0 && (
        <ul className="model-relations">
          {relations.map((relation) => {
            const from = componentName(relation.from);
            const to = componentName(relation.to);
            return (
              <li key={relation.id} className="model-relation">
                <span className={`model-relation-end${from ? '' : ' model-relation-missing'}`}>
                  {from || '(removed)'}
                </span>
                <EditableText
                  value={relation.kind}
                  editable={editable}
                  placeholder="(relates to)"
                  className="model-relation-kind"
                  onSave={(value) => persist({ relations: updateRow(relations, relation.id, { kind: value }) })}
                />
                <span className={`model-relation-end${to ? '' : ' model-relation-missing'}`}>
                  {to || '(removed)'}
                </span>
                <EditableText
                  value={relation.note}
                  editable={editable}
                  placeholder="(why -- click to add)"
                  className="model-relation-note"
                  multiline
                  onSave={(value) => persist({ relations: updateRow(relations, relation.id, { note: value }) })}
                />
                {editable && (
                  <span className="model-controls">
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ relations: moveRow(relations, relation.id, -1) })}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ relations: moveRow(relations, relation.id, 1) })}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="btn-ghost-small"
                      onClick={() => persist({ relations: removeRow(relations, relation.id) })}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && components.length >= 2 && (
        <div className="model-add-relation">
          <select value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}>
            <option value="">From...</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name || '(unnamed)'}
              </option>
            ))}
          </select>{' '}
          <input
            type="text"
            value={relationKind}
            placeholder="relates to"
            className="field-width-40"
            onChange={(event) => setRelationKind(event.target.value)}
          />{' '}
          <select value={relationTo} onChange={(event) => setRelationTo(event.target.value)}>
            <option value="">To...</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name || '(unnamed)'}
              </option>
            ))}
          </select>{' '}
          <button
            type="button"
            className="btn-ghost-small"
            onClick={handleAddRelation}
            disabled={!relationFrom || !relationTo}
          >
            + Add relation
          </button>
        </div>
      )}
      {editable && components.length < 2 && components.length > 0 && (
        <p className="empty-note">Add a second component to start mapping relations between them.</p>
      )}
    </div>
  );
}

export default ModelBlock;
