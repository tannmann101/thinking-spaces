import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TemplatesPage from './TemplatesPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <TemplatesPage />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('TemplatesPage: loading and errors', () => {
  it('shows a loading state, then the Template list once fetched', async () => {
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'Inquiry', block_arrangement: [{ type: 'text' }, { type: 'list' }] }]);
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Inquiry')).toBeInTheDocument();
    expect(screen.getByText('(2 blocks)')).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    api.getTemplates.mockRejectedValue(new Error('Down'));
    renderPage();
    expect(await screen.findByText('Could not load templates: Down')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no Templates', async () => {
    api.getTemplates.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No Templates yet.')).toBeInTheDocument();
  });

  it('uses singular "block" for exactly one block', async () => {
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'Solo', block_arrangement: [{ type: 'text' }] }]);
    renderPage();
    expect(await screen.findByText('(1 block)')).toBeInTheDocument();
  });
});

describe('TemplatesPage: links', () => {
  it('links Edit to the Template editor, and + New Template to /templates/new', async () => {
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'Inquiry', block_arrangement: [] }]);
    renderPage();
    await screen.findByText('Inquiry');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/templates/t1/edit');
    expect(screen.getByRole('link', { name: '+ New Template' })).toHaveAttribute('href', '/templates/new');
  });
});

describe('TemplatesPage: deleting a Template', () => {
  it('deletes a Template once confirmed, and refetches the list', async () => {
    const user = userEvent.setup();
    api.getTemplates.mockResolvedValueOnce([{ id: 't1', name: 'Doomed', block_arrangement: [] }]).mockResolvedValueOnce([]);
    api.deleteTemplate.mockResolvedValue(null);
    renderPage();
    await screen.findByText('Doomed');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen
      .getByText('Delete this Template? Spaces already created from it keep their entries -- deleting a Template never touches them.')
      .closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith('t1'));
    expect(api.getTemplates).toHaveBeenCalledTimes(2);
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'Safe', block_arrangement: [] }]);
    renderPage();
    await screen.findByText('Safe');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteTemplate).not.toHaveBeenCalled();
  });
});
