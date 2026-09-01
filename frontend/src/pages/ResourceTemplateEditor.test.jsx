import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResourceTemplateEditor from './ResourceTemplateEditor.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/resource-templates/new']}>
      <Routes>
        <Route path="/resource-templates/new" element={<ResourceTemplateEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit(id = 'rt1') {
  return render(
    <MemoryRouter initialEntries={[`/resource-templates/${id}/edit`]}>
      <Routes>
        <Route path="/resource-templates/:id/edit" element={<ResourceTemplateEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ResourceTemplateEditor: creating', () => {
  it('shows "New Resource Template" with no loading gate, and one blank facet row', async () => {
    renderNew();
    expect(screen.getByRole('heading', { name: 'New Resource Template' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Facet name, e.g. Core Argument')).toBeInTheDocument();
  });

  it('does nothing on submit until type and label are entered, then creates on submit', async () => {
    const user = userEvent.setup();
    api.createResourceTemplate.mockResolvedValue({ id: 'new-rt' });
    renderNew();

    const saveButton = screen.getByRole('button', { name: 'Save Resource Template' });
    await user.click(saveButton);
    expect(api.createResourceTemplate).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /Type tag/ }), 'gadget');
    await user.type(screen.getByRole('textbox', { name: /Display label/ }), 'Gadget');
    await user.type(screen.getByPlaceholderText('Facet name, e.g. Core Argument'), 'What It Does');
    await user.type(screen.getByPlaceholderText('Guiding question, e.g. What is it arguing?'), 'What does it do?');
    await user.click(saveButton);

    await waitFor(() =>
      expect(api.createResourceTemplate).toHaveBeenCalledWith({
        type: 'gadget',
        label: 'Gadget',
        facets: [{ name: 'What It Does', prompt: 'What does it do?' }],
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/resource-templates');
  });

  it('adds and removes facet rows', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.click(screen.getByRole('button', { name: '+ Add facet' }));
    expect(screen.getAllByPlaceholderText('Facet name, e.g. Core Argument')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByPlaceholderText('Facet name, e.g. Core Argument')).toHaveLength(1);
  });

  it('drops a facet with a blank name on save', async () => {
    const user = userEvent.setup();
    api.createResourceTemplate.mockResolvedValue({ id: 'new-rt' });
    renderNew();
    await user.type(screen.getByRole('textbox', { name: /Type tag/ }), 'gadget');
    await user.type(screen.getByRole('textbox', { name: /Display label/ }), 'Gadget');
    // Leave the one default facet row blank.
    await user.click(screen.getByRole('button', { name: 'Save Resource Template' }));

    await waitFor(() =>
      expect(api.createResourceTemplate).toHaveBeenCalledWith({ type: 'gadget', label: 'Gadget', facets: [] })
    );
  });

  it('shows an error and re-enables saving when creation fails', async () => {
    const user = userEvent.setup();
    api.createResourceTemplate.mockRejectedValue(new Error('Boom'));
    renderNew();
    await user.type(screen.getByRole('textbox', { name: /Type tag/ }), 'gadget');
    await user.type(screen.getByRole('textbox', { name: /Display label/ }), 'Gadget');
    await user.click(screen.getByRole('button', { name: 'Save Resource Template' }));

    expect(await screen.findByText('Error: Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Resource Template' })).toBeEnabled();
  });
});

describe('ResourceTemplateEditor: editing', () => {
  it('shows a loading state, then the existing type/label/facets', async () => {
    api.getResourceTemplate.mockResolvedValue({
      id: 'rt1',
      type: 'book',
      label: 'Book',
      facets: [{ name: 'Core Argument', prompt: 'What is it arguing?' }],
    });
    renderEdit();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Book')).toBeInTheDocument();
    expect(screen.getByDisplayValue('book')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Core Argument')).toBeInTheDocument();
  });

  it('saves via updateResourceTemplate', async () => {
    const user = userEvent.setup();
    api.getResourceTemplate.mockResolvedValue({
      id: 'rt1',
      type: 'book',
      label: 'Book',
      facets: [{ name: 'Core Argument', prompt: 'x' }],
    });
    api.updateResourceTemplate.mockResolvedValue({});
    renderEdit();
    await screen.findByDisplayValue('Book');

    await user.click(screen.getByRole('button', { name: 'Save Resource Template' }));
    await waitFor(() =>
      expect(api.updateResourceTemplate).toHaveBeenCalledWith('rt1', {
        type: 'book',
        label: 'Book',
        facets: [{ name: 'Core Argument', prompt: 'x' }],
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/resource-templates');
  });
});
