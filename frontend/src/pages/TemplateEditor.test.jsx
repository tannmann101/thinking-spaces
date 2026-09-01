import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TemplateEditor from './TemplateEditor.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/templates/new']}>
      <Routes>
        <Route path="/templates/new" element={<TemplateEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit(id = 't1') {
  return render(
    <MemoryRouter initialEntries={[`/templates/${id}/edit`]}>
      <Routes>
        <Route path="/templates/:id/edit" element={<TemplateEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('TemplateEditor: creating', () => {
  it('shows "New Template" with no loading gate, and a blocks empty state', async () => {
    renderNew();
    expect(screen.getByRole('heading', { name: 'New Template' })).toBeInTheDocument();
    expect(screen.getByText('No blocks yet.')).toBeInTheDocument();
  });

  it('does nothing on submit until a name is entered, then creates on submit', async () => {
    const user = userEvent.setup();
    api.createTemplate.mockResolvedValue({ id: 'new-t' });
    renderNew();

    const saveButton = screen.getByRole('button', { name: 'Save Template' });
    await user.click(saveButton);
    expect(api.createTemplate).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'My Template');
    await user.click(saveButton);

    await waitFor(() =>
      expect(api.createTemplate).toHaveBeenCalledWith({ name: 'My Template', blockArrangement: [] })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('adds a block via NewBlockForm, shows it in the preview, and can remove/reorder it', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.click(screen.getByRole('button', { name: '+ Add Block' }));
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Add Block' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);

    const [firstMoveUp] = screen.getAllByRole('button', { name: 'Move up' });
    expect(firstMoveUp).toBeDisabled();

    await user.click(removeButtons[0]);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('shows an error and re-enables saving when creation fails', async () => {
    const user = userEvent.setup();
    api.createTemplate.mockRejectedValue(new Error('Boom'));
    renderNew();
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'X');
    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    expect(await screen.findByText('Error: Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Template' })).toBeEnabled();
  });
});

describe('TemplateEditor: editing', () => {
  it('shows a loading state, then the existing name and blocks', async () => {
    api.getTemplate.mockResolvedValue({ id: 't1', name: 'Existing', block_arrangement: [{ type: 'text', content: { text: 'hi' } }] });
    renderEdit();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Existing')).toBeInTheDocument();
    expect(screen.getByText(/\[Text\] hi/)).toBeInTheDocument();
  });

  it('saves via updateTemplate, renumbering block positions', async () => {
    const user = userEvent.setup();
    api.getTemplate.mockResolvedValue({
      id: 't1',
      name: 'Existing',
      block_arrangement: [{ type: 'text', content: { text: 'a' } }, { type: 'list', content: { items: [] } }],
    });
    api.updateTemplate.mockResolvedValue({});
    renderEdit();
    await screen.findByDisplayValue('Existing');

    await user.click(screen.getByRole('button', { name: 'Save Template' }));
    await waitFor(() =>
      expect(api.updateTemplate).toHaveBeenCalledWith('t1', {
        name: 'Existing',
        blockArrangement: [
          { type: 'text', content: { text: 'a' }, position: 0 },
          { type: 'list', content: { items: [] }, position: 1 },
        ],
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });
});
