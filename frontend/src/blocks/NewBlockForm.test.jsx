import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewBlockForm from './NewBlockForm.jsx';
import { blockRegistry } from '../registry/blocks.js';
import * as api from '../api.js';

vi.mock('../api.js');

// Scoped to the "Compare Work Types" panel added once a native <select>
// was found unable to show more than one Work Type's description at a
// time -- comparing close calls like Insight vs. Implication meant
// reselecting through all 11 in turn. The rest of NewBlockForm's own
// behavior (submitting each entry shape) is already covered indirectly
// through SpacePage/WorkspacePage/CreateSpace/TemplateEditor's own
// tests, which all embed this form.
describe('NewBlockForm: Compare Work Types panel', () => {
  it('lists every Work Type\'s label and description, collapsed by default', () => {
    render(<NewBlockForm onAdd={vi.fn()} />);
    const details = screen.getByText('Compare Work Types').closest('details');
    expect(details).not.toHaveAttribute('open');

    // blockRegistry is the one source of truth for this list -- a
    // future Work Type should show up here with no edit to this file,
    // so assert against the registry itself rather than a hardcoded count.
    const workTypes = Object.values(blockRegistry).filter((entry) => entry.family === 'work');
    expect(workTypes.length).toBeGreaterThan(0);
    workTypes.forEach((entry) => {
      expect(screen.getByRole('button', { name: entry.label })).toBeInTheDocument();
      expect(screen.getByText(entry.description)).toBeInTheDocument();
    });
  });

  it('selects a Work Type in the dropdown when its label is clicked in the panel', async () => {
    const user = userEvent.setup();
    render(<NewBlockForm onAdd={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Implication' }));
    expect(screen.getByRole('combobox')).toHaveValue('implication');
    // Implication's description now shows twice -- once in the ordinary
    // single-selection paragraph, once still in the comparison panel
    // below it -- so assert the single-selection paragraph specifically
    // rather than a getByText that would match both.
    expect(document.querySelector('.new-block-type-description').textContent).toBe(
      blockRegistry.implication.description
    );
  });
});

// Three of the five General Tools used to be unreachable from a Space:
// attaching a PDF to a thought you were already having meant leaving
// for "+ New Resource", which creates a whole separate Space.
describe('NewBlockForm: the General Tools that were missing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getSpaces.mockResolvedValue([
      { id: 'space-1', title: 'This Space' },
      { id: 'space-2', title: 'Another Space' },
    ]);
  });

  function renderOnSpace(onAdd = vi.fn()) {
    render(<NewBlockForm onAdd={onAdd} spaceId="space-1" />);
    return onAdd;
  }

  it('offers Reference, Media and Comparison on a live Space', () => {
    renderOnSpace();
    const options = [...document.querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(['reference', 'media', 'comparison']));
  });

  // A Template carrying a hardcoded Reference to one particular Space
  // isn't a Template, and Creation Mode's drafts have no Space yet.
  it('hides them where there is no Space to add them to', () => {
    render(<NewBlockForm onAdd={vi.fn()} />);
    const options = [...document.querySelectorAll('option')].map((o) => o.value);
    expect(options).not.toContain('reference');
    expect(options).not.toContain('media');
    expect(options).not.toContain('comparison');
  });

  it('adds a Reference pointing at another Space, excluding this one', async () => {
    const user = userEvent.setup();
    const onAdd = renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'reference');

    const picker = await screen.findByLabelText('Points at:');
    expect([...picker.querySelectorAll('option')].map((o) => o.value)).not.toContain('space-1');

    await user.selectOptions(picker, 'space-2');
    await user.type(screen.getByPlaceholderText('Why this connects (optional)'), 'these rhyme');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reference',
        content: { target_space_id: 'space-2', note: 'these rhyme' },
      })
    );
  });

  it('will not add a Reference that points nowhere', async () => {
    const user = userEvent.setup();
    renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'reference');
    await screen.findByLabelText('Points at:');
    expect(screen.getByRole('button', { name: '+ Add Entry' })).toBeDisabled();
  });

  it('uploads a file and adds it as a document entry', async () => {
    const user = userEvent.setup();
    api.uploadFile.mockResolvedValue({
      url: '/api/uploads/abc.pdf',
      originalName: 'paper.pdf',
      mimeType: 'application/pdf',
    });
    const onAdd = renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'media');
    await user.click(screen.getByRole('button', { name: 'Upload a file' }));

    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' });
    await user.upload(document.querySelector('input[type="file"]'), file);
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media',
        content: expect.objectContaining({
          mediaType: 'document',
          url: '/api/uploads/abc.pdf',
          fileName: 'paper.pdf',
        }),
      })
    );
  });

  it('pastes a link, previewing it on blur', async () => {
    const user = userEvent.setup();
    api.getLinkPreview.mockResolvedValue({ title: 'A real page', description: null, image: null, siteName: null });
    const onAdd = renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'media');

    await user.type(screen.getByPlaceholderText('https://...'), 'https://example.com');
    await user.tab();
    await waitFor(() => expect(api.getLinkPreview).toHaveBeenCalledWith('https://example.com'));

    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media',
        content: expect.objectContaining({ mediaType: 'link', linkTitle: 'A real page' }),
      })
    );
  });

  // A preview is a nicety; failing to get one must never block the link.
  it('still adds the link when the preview fails', async () => {
    const user = userEvent.setup();
    api.getLinkPreview.mockRejectedValue(new Error('unreachable'));
    const onAdd = renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'media');
    await user.type(screen.getByPlaceholderText('https://...'), 'https://example.com');
    await user.tab();
    await screen.findByText(/can still be added/);

    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ linkTitle: null }) })
    );
  });

  it('adds a Comparison with both sides', async () => {
    const user = userEvent.setup();
    const onAdd = renderOnSpace();
    await user.selectOptions(screen.getByLabelText('Entry type:'), 'comparison');

    expect(screen.getByRole('button', { name: '+ Add Entry' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('One side'), 'Option A');
    await user.type(screen.getByPlaceholderText('The other side'), 'Option B');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'comparison',
        content: expect.objectContaining({
          left: { kind: 'text', tag: null, text: 'Option A' },
          right: { kind: 'text', tag: null, text: 'Option B' },
        }),
      })
    );
  });
});
