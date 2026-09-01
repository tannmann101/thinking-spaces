import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResourceTemplatesPage from './ResourceTemplatesPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <ResourceTemplatesPage />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ResourceTemplatesPage: loading and errors', () => {
  it('shows a loading state, then the Resource Template list once fetched', async () => {
    api.getResourceTemplates.mockResolvedValue([
      { id: 'rt1', type: 'book', label: 'Book', facets: [{ name: 'A' }, { name: 'B' }] },
    ]);
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Book')).toBeInTheDocument();
    expect(screen.getByText('(book, 2 facets)')).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    api.getResourceTemplates.mockRejectedValue(new Error('Down'));
    renderPage();
    expect(await screen.findByText('Could not load Resource Templates: Down')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no Resource Templates', async () => {
    api.getResourceTemplates.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No Resource Templates yet.')).toBeInTheDocument();
  });

  it('uses singular "facet" for exactly one facet', async () => {
    api.getResourceTemplates.mockResolvedValue([{ id: 'rt1', type: 'poem', label: 'Poem', facets: [{ name: 'A' }] }]);
    renderPage();
    expect(await screen.findByText('(poem, 1 facet)')).toBeInTheDocument();
  });
});

describe('ResourceTemplatesPage: links', () => {
  it('links Edit to the editor, and + New Resource Template to /resource-templates/new', async () => {
    api.getResourceTemplates.mockResolvedValue([{ id: 'rt1', type: 'book', label: 'Book', facets: [] }]);
    renderPage();
    await screen.findByText('Book');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/resource-templates/rt1/edit');
    expect(screen.getByRole('link', { name: '+ New Resource Template' })).toHaveAttribute(
      'href',
      '/resource-templates/new'
    );
  });

  it('links back to Templates', async () => {
    api.getResourceTemplates.mockResolvedValue([]);
    renderPage();
    const link = await screen.findByRole('link', { name: /Back to Templates/ });
    expect(link).toHaveAttribute('href', '/templates');
  });
});

describe('ResourceTemplatesPage: deleting a Resource Template', () => {
  it('deletes a Resource Template once confirmed, and refetches the list', async () => {
    const user = userEvent.setup();
    api.getResourceTemplates
      .mockResolvedValueOnce([{ id: 'rt1', type: 'book', label: 'Doomed', facets: [] }])
      .mockResolvedValueOnce([]);
    api.deleteResourceTemplate.mockResolvedValue(null);
    renderPage();
    await screen.findByText('Doomed');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByText(/Delete the "Doomed" Resource Template\?/).closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteResourceTemplate).toHaveBeenCalledWith('rt1'));
    expect(api.getResourceTemplates).toHaveBeenCalledTimes(2);
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    api.getResourceTemplates.mockResolvedValue([{ id: 'rt1', type: 'book', label: 'Safe', facets: [] }]);
    renderPage();
    await screen.findByText('Safe');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteResourceTemplate).not.toHaveBeenCalled();
  });
});
