import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';

function TemplatesPage() {
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
        'Delete this Template? Spaces already created from it keep their blocks -- deleting a Template never touches them.'
      ))
    ) {
      return;
    }
    await deleteTemplate(id);
    refetch();
  }

  return (
    <main>
      <Link to="/" className="back-link">
        &larr; Back to Dashboard
      </Link>
      <div className="page-head">
        <h1>Templates</h1>
        <Link to="/templates/new" className="btn">
          + New Template
        </Link>
      </div>

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
                  ({template.block_arrangement.length} block
                  {template.block_arrangement.length === 1 ? '' : 's'})
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
  );
}

export default TemplatesPage;
