// Create or edit one Template. This is "Dev Mode" for this architecture:
// there's no live-cascading system to be careful with, because editing a
// Template only ever writes to the templates table (see updateTemplate in
// backend/src/db/queries.js) -- applyTemplate only runs once, at the moment
// a Space is created from a Template, and nothing ever reads template_id
// again after that. So this editor can be as blunt as it likes: whatever
// is saved here only affects Spaces created from this Template from now on.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTemplate, createTemplate, updateTemplate } from '../api.js';
import NewBlockForm from '../blocks/NewBlockForm.jsx';

// Read-only preview of one draft block. Not the live blockRegistry
// components -- those expect a real saved block with a database id and
// would try to PATCH a block that doesn't exist yet. Text and List are
// the two types this editor can actually create/edit; anything else
// (Reference, Media, Comparison) can only already be present in a
// template built before this UI existed, so it's shown but left alone
// rather than silently dropped.
function BlockPreview({ block }) {
  if (block.type === 'text') {
    return <p>[Text] {block.content?.text || <em>(empty)</em>}</p>;
  }
  if (block.type === 'list') {
    return (
      <div>
        <p>
          [List] {block.content?.laneLabel || <em>(no heading)</em>}
        </p>
        <ul>
          {(block.content?.items || []).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <p>[{block.type}] (not editable in this UI -- preserved as-is)</p>;
}

function TemplateEditor() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [loaded, setLoaded] = useState(!isEditing);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    getTemplate(id)
      .then((template) => {
        setName(template.name);
        setBlocks(template.block_arrangement);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, [id, isEditing]);

  function addBlock(spec) {
    setBlocks((current) => [...current, spec]);
  }

  function removeBlock(index) {
    setBlocks((current) => current.filter((_, i) => i !== index));
  }

  function moveBlock(index, direction) {
    setBlocks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    // Position is just array order -- renumber on save so it always
    // matches whatever order the blocks ended up in on screen.
    const blockArrangement = blocks.map((block, index) => ({ ...block, position: index }));
    try {
      if (isEditing) {
        await updateTemplate(id, { name: name.trim(), blockArrangement });
      } else {
        await createTemplate({ name: name.trim(), blockArrangement });
      }
      navigate('/templates');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (isEditing && !loaded && !error) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main>
      <Link to="/templates" className="back-link">
        &larr; Back to Templates
      </Link>
      <h1>{isEditing ? 'Edit Template' : 'New Template'}</h1>
      {isEditing && (
        <p>
          Saving here only changes what future Spaces created from this Template start with.
          Spaces already created from it keep the blocks they already have.
        </p>
      )}
      {error && <p>Error: {error}</p>}

      <form onSubmit={handleSave}>
        <p>
          <label>
            Name:{' '}
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        </p>

        <h2>Blocks</h2>
        {blocks.length === 0 && <p>No blocks yet.</p>}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {blocks.map((block, index) => (
            <li key={index} className="block-row" style={{ marginBottom: '12px' }}>
              <BlockPreview block={block} />
              <div className="block-controls">
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() => moveBlock(index, -1)}
                  disabled={index === 0}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() => moveBlock(index, 1)}
                  disabled={index === blocks.length - 1}
                >
                  Move down
                </button>
                <button type="button" className="btn-ghost-small" onClick={() => removeBlock(index)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>

        <NewBlockForm onAdd={addBlock} />

        <p>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </p>
      </form>
    </main>
  );
}

export default TemplateEditor;
