import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TrashPage from './TrashPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <TrashPage />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

const entry = {
  id: 't1',
  kind: 'space',
  label: 'A deleted Space',
  context: null,
  deleted_at: '2026-09-03 10:00:00',
};

beforeEach(() => {
  vi.resetAllMocks();
  api.getTrash.mockResolvedValue([entry]);
  api.restoreFromTrash.mockResolvedValue({});
  api.purgeTrashEntry.mockResolvedValue({});
  api.emptyTrash.mockResolvedValue({ purged: 1 });
});

describe('TrashPage', () => {
  it('says plainly when nothing has been deleted', async () => {
    api.getTrash.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Nothing deleted/)).toBeInTheDocument();
  });

  it('lists what was deleted, reading its kind in the app own words', async () => {
    renderPage();
    expect(await screen.findByText('A deleted Space')).toBeInTheDocument();
    expect(screen.getByText(/^Space ·/)).toBeInTheDocument();
  });

  it('reads a deleted entry as an Entry, not the raw kind key', async () => {
    api.getTrash.mockResolvedValue([{ ...entry, kind: 'block', label: 'hypothesis', context: 'My Space' }]);
    renderPage();
    expect(await screen.findByText(/^Entry · from My Space/)).toBeInTheDocument();
  });

  it('restores without asking, since restoring is the safe direction', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreFromTrash).toHaveBeenCalledWith('t1'));
    expect(api.getTrash).toHaveBeenCalledTimes(2);
  });

  it('asks before deleting permanently, because that one cannot be undone', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).toBeTruthy());
    const dialog = document.querySelector('.confirm-dialog');
    expect(within(dialog).getByText(/can't be undone/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.purgeTrashEntry).toHaveBeenCalledWith('t1'));
  });

  it('leaves the entry alone when the confirm is declined', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).toBeTruthy());
    const dialog = document.querySelector('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.purgeTrashEntry).not.toHaveBeenCalled();
  });

  it('asks before emptying the whole trash', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Empty the trash' }));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).toBeTruthy());
    const dialog = document.querySelector('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.emptyTrash).toHaveBeenCalled());
  });

  it('surfaces a failure rather than an empty page', async () => {
    api.getTrash.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Could not load the trash: Nope')).toBeInTheDocument();
  });
});
