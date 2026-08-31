import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createSpace, getTemplates } from '../api.js';

function CreateSpace() {
  const [title, setTitle] = useState('');
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState(null); // null = start blank
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getTemplates().then(setTemplates).catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const space = await createSpace({ title: title.trim(), templateId });
      navigate(`/spaces/${space.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>New Space</h1>
      <p>
        <Link to="/">&larr; Back to Dashboard</Link>
      </p>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Name</label>
          <br />
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this Space about?"
            required
          />
        </div>

        <fieldset>
          <legend>Start from a Template</legend>
          {templates === null && <p>Loading templates...</p>}
          {templates && templates.length === 0 && <p>No Templates exist yet.</p>}
          {templates && templates.length > 0 && (
            <>
              <label>
                <input
                  type="radio"
                  name="template"
                  checked={templateId === null}
                  onChange={() => setTemplateId(null)}
                />{' '}
                Start Blank
              </label>
              <br />
              {templates.map((template) => (
                <label key={template.id} style={{ display: 'block' }}>
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === template.id}
                    onChange={() => setTemplateId(template.id)}
                  />{' '}
                  {template.name}
                </label>
              ))}
            </>
          )}
        </fieldset>

        <p>
          <button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? 'Creating...' : 'Create Space'}
          </button>
        </p>

        {error && <p>Could not create Space: {error}</p>}
      </form>
    </main>
  );
}

export default CreateSpace;
