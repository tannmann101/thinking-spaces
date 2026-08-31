import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api.js';

function TemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);

  function refetch() {
    getTemplates().then(setTemplates).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refetch();
  }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this Template? Spaces already created from it keep their blocks -- deleting a Template never touches them.')) {
      return;
    }
    await deleteTemplate(id);
    refetch();
  }

  return (
    <main>
      <h1>Templates</h1>
      <p>
        <Link to="/">&larr; Back to Dashboard</Link>
      </p>
      <p>
        <Link to="/templates/new">+ New Template</Link>
      </p>

      {error && <p>Could not load templates: {error}</p>}
      {templates === null && !error && <p>Loading...</p>}
      {templates && templates.length === 0 && <p>No Templates yet.</p>}
      {templates && templates.length > 0 && (
        <ul>
          {templates.map((template) => (
            <li key={template.id}>
              {template.name} ({template.block_arrangement.length} block
              {template.block_arrangement.length === 1 ? '' : 's'}) —{' '}
              <Link to={`/templates/${template.id}/edit`}>Edit</Link>{' '}
              <button type="button" onClick={() => handleDelete(template.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default TemplatesPage;
