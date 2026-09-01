// Create or edit one Resource Template's facets. Same "no live-
// cascading system to be careful with" reasoning TemplateEditor.jsx
// already documents for ordinary Templates -- CreateResource.jsx looks
// this up fresh, by type, every time a new Resource is being created,
// so an edit here only ever affects Resources created from this point
// on, never ones that already exist.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getResourceTemplate, createResourceTemplate, updateResourceTemplate } from '../api.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function emptyFacet() {
  return { name: '', prompt: '' };
}

function ResourceTemplateEditor() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  usePageTitle(isEditing ? 'Edit Resource Template' : 'New Resource Template');

  const [type, setType] = useState('');
  const [label, setLabel] = useState('');
  const [facets, setFacets] = useState([emptyFacet()]);
  const [loaded, setLoaded] = useState(!isEditing);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    getResourceTemplate(id)
      .then((template) => {
        setType(template.type);
        setLabel(template.label);
        setFacets(template.facets.length > 0 ? template.facets : [emptyFacet()]);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, [id, isEditing]);

  function updateFacet(index, patch) {
    setFacets((current) => current.map((facet, i) => (i === index ? { ...facet, ...patch } : facet)));
  }

  function addFacet() {
    setFacets((current) => [...current, emptyFacet()]);
  }

  function removeFacet(index) {
    setFacets((current) => current.filter((_, i) => i !== index));
  }

  function moveFacet(index, direction) {
    setFacets((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!type.trim() || !label.trim()) return;
    setSaving(true);
    const cleanFacets = facets
      .map((facet) => ({ name: facet.name.trim(), prompt: facet.prompt.trim() }))
      .filter((facet) => facet.name);
    try {
      if (isEditing) {
        await updateResourceTemplate(id, { type: type.trim(), label: label.trim(), facets: cleanFacets });
      } else {
        await createResourceTemplate({ type: type.trim(), label: label.trim(), facets: cleanFacets });
      }
      navigate('/resource-templates');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (isEditing && !loaded && !error) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="app-content">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      <Link to="/resource-templates" className="back-link">
        &larr; Back to Resource Templates
      </Link>
      <h1>{isEditing ? 'Edit Resource Template' : 'New Resource Template'}</h1>
      {isEditing && (
        <p>
          Saving here only changes what a future Resource of this type starts with. Resources
          already created from it keep the entries they already have.
        </p>
      )}
      {error && <p>Error: {error}</p>}

      <form onSubmit={handleSave}>
        <p>
          <label>
            Type tag it matches:{' '}
            <input
              type="text"
              value={type}
              placeholder="e.g. book"
              onChange={(event) => setType(event.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Display label:{' '}
            <input
              type="text"
              value={label}
              placeholder="e.g. Book"
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </label>
        </p>

        <h2>Facets</h2>
        <p>Each becomes a guided question and a starting Category on a Resource of this type.</p>
        {facets.length === 0 && <p>No facets yet.</p>}
        <ol className="list-reset">
          {facets.map((facet, index) => (
            <li key={index} className="block-row list-reset-row">
              <p>
                <input
                  type="text"
                  value={facet.name}
                  placeholder="Facet name, e.g. Core Argument"
                  className="field-width-40"
                  onChange={(event) => updateFacet(index, { name: event.target.value })}
                />{' '}
                <input
                  type="text"
                  value={facet.prompt}
                  placeholder="Guiding question, e.g. What is it arguing?"
                  className="field-width-55"
                  onChange={(event) => updateFacet(index, { prompt: event.target.value })}
                />
              </p>
              <div className="block-controls">
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() => moveFacet(index, -1)}
                  disabled={index === 0}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() => moveFacet(index, 1)}
                  disabled={index === facets.length - 1}
                >
                  Move down
                </button>
                <button type="button" className="btn-ghost-small" onClick={() => removeFacet(index)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <p>
          <button type="button" className="btn-ghost-small" onClick={addFacet}>
            + Add facet
          </button>
        </p>

        <p>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Resource Template'}
          </button>
        </p>
      </form>
      </main>
    </div>
  );
}

export default ResourceTemplateEditor;
