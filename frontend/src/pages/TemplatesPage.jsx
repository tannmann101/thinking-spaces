import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function TemplatesPage() {
  usePageTitle('Templates');
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const { confirm } = useConfirmDialog();

  function refetch() {
    getTemplates().then(setTemplates).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetch();
  }, []);

  async function handleDelete(id) {
    if (
      !(await confirm(
        'Delete this Template? Spaces already created from it keep their entries -- deleting a Template never touches them.'
      ))
    ) {
      return;
    }
    await deleteTemplate(id);
    refetch();
  }

  return (
    <div className="app-shell">
      <Sidebar current="templates" />
      <main className="app-content">
      <div className="page-head">
        <h1>Templates</h1>
        <Link to="/templates/new" className="btn">
          + New Template
        </Link>
      </div>
      <p>
        <Link to="/resource-templates">Manage Resource Templates</Link> -- a separate set of
        starting facets used specifically by <Link to="/resources/new">New Resource</Link>, one per
        type of thing (Book, Poem, Debate, ...).
      </p>

      {error && <p>Could not load templates: {error}</p>}
      {templates === null && !error && <p>Loading...</p>}
      {templates && templates.length === 0 && <p>No Templates yet.</p>}
      {templates && templates.length > 0 && (
        <ul className="plain-card-list">
          {templates.map((template) => (
            <li key={template.id}>
              <span>
                {template.name}{' '}
                <span className="mono-caption">
                  ({template.block_arrangement.length} entr
                  {template.block_arrangement.length === 1 ? 'y' : 'ies'})
                </span>
              </span>
              <span className="row-actions">
                <Link to={`/templates/${template.id}/edit`} className="btn-ghost-small">
                  Edit
                </Link>
                <button type="button" className="btn-ghost-small" onClick={() => handleDelete(template.id)}>
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

export default TemplatesPage;
