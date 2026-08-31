// Creation Mode: pick a starting cluster (a Template, or blank), see
// and add to its starting Tools, pull in existing Resources as
// References, and personalize with tags and a "working toward" goal --
// all composed server-side by createSpaceWithSetup in one request. A
// Template's own starting blocks are shown as a preview here (not
// individually removable pre-creation, to keep this one slice
// reasonable) -- anything not wanted can still be removed the moment
// after creation, the same ordinary way blocks are always removed.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSpace, getTemplates, getSpacesByTag } from '../api.js';
import NewBlockForm from '../blocks/NewBlockForm.jsx';
import BlockPreview from '../blocks/BlockPreview.jsx';
import TopNav from '../components/TopNav.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function CreateSpace() {
  usePageTitle('New Space');
  const [title, setTitle] = useState('');
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState(null); // null = start blank
  const [extraBlocks, setExtraBlocks] = useState([]);
  const [workspaceNames, setWorkspaceNames] = useState([]);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('');
  const [resources, setResources] = useState(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState(new Set());
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getTemplates().then(setTemplates).catch((err) => setError(err.message));
    getSpacesByTag('resource').then(setResources).catch(() => setResources([]));
  }, []);

  const selectedTemplate = templates?.find((template) => template.id === templateId) || null;

  function toggleResource(id) {
    setSelectedResourceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Not a <form> -- this whole page already is one (the "Create Space"
  // submit), and a nested <form> is invalid HTML that Chromium resolves
  // by routing the inner input's Enter-to-submit to the outer form
  // instead (the same bug NewBlockForm hit and was fixed for). A plain
  // onKeyDown sidesteps it, matching how every other inline editor in
  // this app (TextBlock, ReferenceBlock, ...) handles Enter-to-save.
  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    setTagInput('');
    if (!tag || tags.includes(tag)) return;
    setTags([...tags, tag]);
  }

  function removeTag(tag) {
    setTags(tags.filter((t) => t !== tag));
  }

  // Named here, before any Workspace exists as a real row -- see
  // NewBlockForm's `workspaceNames` prop and createSpaceWithSetup on the
  // backend, which resolves these draft names into real Workspace ids
  // once the Space (and so the Workspaces) actually get created.
  function addDraftWorkspace() {
    const name = workspaceNameInput.trim();
    setWorkspaceNameInput('');
    if (!name || workspaceNames.includes(name)) return;
    setWorkspaceNames([...workspaceNames, name]);
  }

  function removeDraftWorkspace(name) {
    setWorkspaceNames(workspaceNames.filter((n) => n !== name));
    // A block already filed under a Workspace that's just been removed
    // simply loses that (now-nonexistent) assignment -- same as removing
    // a Category never deletes what was filed under it.
    setExtraBlocks(
      extraBlocks.map((block) => ({
        ...block,
        properties: {
          ...block.properties,
          workspaceNames: (block.properties?.workspaceNames || []).filter((n) => n !== name),
        },
      }))
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const space = await createSpace({
        title: title.trim(),
        templateId,
        extraBlocks,
        resourceSpaceIds: [...selectedResourceIds],
        tags,
        workspaces: workspaceNames,
        goal: goal.trim() || null,
      });
      navigate(`/spaces/${space.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main>
      <TopNav />
      <h1>New Space</h1>

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
        <br />

        <h2>Starting cluster</h2>
        <p>Every Space is tailored, but most start from one of these.</p>
        {templates === null && <p>Loading templates...</p>}
        {templates && (
          <div className="cluster-grid">
            <button
              type="button"
              className={`cluster-card${templateId === null ? ' selected' : ''}`}
              onClick={() => setTemplateId(null)}
            >
              <h3>Start Blank</h3>
              <p>No starting Tools -- build this Space up from nothing.</p>
            </button>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`cluster-card${templateId === template.id ? ' selected' : ''}`}
                onClick={() => setTemplateId(template.id)}
              >
                <h3>{template.name}</h3>
                <p>
                  {template.block_arrangement.length} starting Tool
                  {template.block_arrangement.length === 1 ? '' : 's'}
                </p>
              </button>
            ))}
          </div>
        )}

        {selectedTemplate && (
          <div className="cluster-preview">
            <p className="cluster-preview-label">What "{selectedTemplate.name}" starts with:</p>
            {selectedTemplate.block_arrangement.map((block, index) => (
              <div key={index} className="cluster-preview-block">
                <BlockPreview block={block} />
              </div>
            ))}
          </div>
        )}

        <h2>Workspaces</h2>
        <p>
          Optionally name a Workspace or two up front -- a dedicated environment to assemble some of
          this Space's Tools into from the start, instead of only ever adding one after creation.
        </p>
        {workspaceNames.length > 0 && (
          <p className="workspace-name-row">
            {workspaceNames.map((name) => (
              <span key={name} className="workspace-chip">
                {name}{' '}
                <span className="editable-toggle" onClick={() => removeDraftWorkspace(name)} title="Remove">
                  ✕
                </span>
              </span>
            ))}
          </p>
        )}
        <span className="workspace-add-form">
          <input
            type="text"
            value={workspaceNameInput}
            placeholder="+ Workspace name"
            onChange={(event) => setWorkspaceNameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addDraftWorkspace();
              }
            }}
          />
          <button type="button" className="btn-ghost-small" onClick={addDraftWorkspace}>
            Add
          </button>
        </span>

        <h2>Tools</h2>
        <p>Add any extra Tools this Space should start with, on top of its cluster.</p>
        {extraBlocks.length > 0 && (
          <ol className="cluster-preview">
            {extraBlocks.map((block, index) => (
              <li key={index} className="cluster-preview-block block-row">
                <BlockPreview block={block} />
                {block.properties?.workspaceNames?.length > 0 && (
                  <p className="block-workspace-row">
                    {block.properties.workspaceNames.map((name) => (
                      <span key={name} className="workspace-chip workspace-chip-active">
                        {name}
                      </span>
                    ))}
                  </p>
                )}
                <div className="block-controls">
                  <button
                    type="button"
                    className="btn-ghost-small"
                    onClick={() => setExtraBlocks(extraBlocks.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <NewBlockForm onAdd={(spec) => setExtraBlocks([...extraBlocks, spec])} workspaceNames={workspaceNames} />

        <h2>Resources</h2>
        {resources === null && <p>Loading...</p>}
        {resources && resources.length === 0 && (
          <p>No Resources yet -- tag a Space "resource" to have it show up here.</p>
        )}
        {resources && resources.length > 0 && (
          <>
            <p>Pull in any existing Resources this Space should reference from the start.</p>
            <ul className="checkbox-list">
              {resources.map((space) => (
                <li key={space.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedResourceIds.has(space.id)}
                      onChange={() => toggleResource(space.id)}
                    />{' '}
                    {space.title}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2>Personalize</h2>
        <p className="working-toward">
          Working toward:{' '}
          <input
            type="text"
            value={goal}
            placeholder="(optional)"
            className="field-width-60"
            onChange={(event) => setGoal(event.target.value)}
          />
        </p>
        <p className="tag-row">
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}{' '}
              <span className="editable-toggle" onClick={() => removeTag(tag)} title="Remove tag">
                ✕
              </span>
            </span>
          ))}
          <span className="tag-add-form">
            <input
              type="text"
              value={tagInput}
              placeholder="+ tag"
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
            />
          </span>
        </p>

        <p>
          <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Creating...' : 'Create Space'}
          </button>
        </p>

        {error && <p>Could not create Space: {error}</p>}
      </form>
    </main>
  );
}

export default CreateSpace;
