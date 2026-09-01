// Lists every Resource Template -- a deliberately separate mechanism
// from ordinary Templates (TemplatesPage.jsx), reached from there via a
// contextual link rather than its own top-level Sidebar entry, since
// it's a configuration page for one specific creation flow
// (CreateResource.jsx), not a top-level destination in its own right.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResourceTemplates, deleteResourceTemplate } from '../api.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function ResourceTemplatesPage() {
  usePageTitle('Resource Templates');
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const { confirm } = useConfirmDialog();

  function refetch() {
    getResourceTemplates().then(setTemplates).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetch();
  }, []);

  async function handleDelete(id, label) {
    if (
      !(await confirm(
        `Delete the "${label}" Resource Template? A Resource already created with it keeps its own entries -- deleting a Template never touches them. New Resources of this type will use the generic questions instead.`
      ))
    ) {
      return;
    }
    await deleteResourceTemplate(id);
    refetch();
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
      <Link to="/templates" className="back-link">
        &larr; Back to Templates
      </Link>
      <div className="page-head">
        <h1>Resource Templates</h1>
        <Link to="/resource-templates/new" className="btn">
          + New Resource Template
        </Link>
      </div>
      <p>
        Each replaces the generic questions on <Link to="/resources/new">New Resource</Link> with a
        set tailored to that one type -- matched by the type tag chosen there (e.g. "book").
      </p>

      {error && <p>Could not load Resource Templates: {error}</p>}
      {templates === null && !error && <p>Loading...</p>}
      {templates && templates.length === 0 && <p>No Resource Templates yet.</p>}
      {templates && templates.length > 0 && (
        <ul className="plain-card-list">
          {templates.map((template) => (
            <li key={template.id}>
              <span>
                {template.label}{' '}
                <span className="mono-caption">
                  ({template.type}, {template.facets.length} facet{template.facets.length === 1 ? '' : 's'})
                </span>
              </span>
              <span className="row-actions">
                <Link to={`/resource-templates/${template.id}/edit`} className="btn-ghost-small">
                  Edit
                </Link>
                <button type="button" className="btn-ghost-small" onClick={() => handleDelete(template.id, template.label)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      </main>
    </div>
  );
}

export default ResourceTemplatesPage;
