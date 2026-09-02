import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkspacePage from './WorkspacePage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

// jsdom doesn't implement scrollIntoView at all -- only the flash-on-add
// tests below actually check it, but the flash effect calls it
// unconditionally whenever a block is added, same reasoning
// SpacePage.test.jsx already stubs this for.
Element.prototype.scrollIntoView = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(path = '/spaces/space-1/workspaces/ws-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/spaces/:spaceId/workspaces/:workspaceId" element={<WorkspacePage />} />
        </Routes>
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpace.mockResolvedValue({ id: 'space-1', title: 'My Space', categories: [] });
  api.getWorkspace.mockResolvedValue({ id: 'ws-1', name: 'Focus Area' });
  api.getBlocksForSpace.mockResolvedValue([]);
});

describe('WorkspacePage: loading and errors', () => {
  it('shows a loading state, then the Workspace once fetched', async () => {
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Focus Area')).toBeInTheDocument();
    expect(screen.getByText('A Workspace inside “My Space”')).toBeInTheDocument();
  });

  it('shows an error when the Workspace fails to load', async () => {
    api.getWorkspace.mockRejectedValue(new Error('Gone'));
    renderPage();
    expect(await screen.findByText('Could not load Workspace: Gone')).toBeInTheDocument();
  });

  it('links back to the parent Space', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /Back to My Space/ });
    expect(link).toHaveAttribute('href', '/spaces/space-1');
  });
});

describe('WorkspacePage: renaming', () => {
  it('renames the Workspace on blur', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Focus Area'));
    const input = screen.getByDisplayValue('Focus Area');
    await user.clear(input);
    await user.type(input, 'Renamed Area');
    await user.tab();
    await waitFor(() => expect(api.renameWorkspace).toHaveBeenCalledWith('ws-1', 'Renamed Area'));
  });
});

describe('WorkspacePage: assembled blocks', () => {
  it('shows an empty-state message when nothing is assembled yet', async () => {
    renderPage();
    expect(await screen.findByText('Nothing assembled here yet -- add a Tool below, or pull in one already on the Space.')).toBeInTheDocument();
  });

  it('renders assembled blocks, and lets one be removed from the Workspace', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'In this Workspace', tag: null }] }, properties: { workspaces: ['ws-1'] }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('In this Workspace');

    await user.click(screen.getByRole('button', { name: 'Remove from Workspace' }));
    await waitFor(() => expect(api.updateBlockWorkspaces).toHaveBeenCalledWith('b1', []));
  });

  it('deletes a member block entirely after confirming', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Doomed', tag: null }] }, properties: { workspaces: ['ws-1'] }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Doomed');

    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    const dialog = screen.getByText('Remove this entry entirely? This cannot be undone.').closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteBlockApi).toHaveBeenCalledWith('b1'));
  });
});

describe('WorkspacePage: adding and pulling in Tools', () => {
  it('adding a new block via NewBlockForm tags it into this Workspace', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Add a new Tool to this Workspace');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    await waitFor(() =>
      expect(api.addBlockToSpace).toHaveBeenCalledWith(
        'space-1',
        expect.objectContaining({ properties: expect.objectContaining({ workspaces: ['ws-1'] }) })
      )
    );
  });

  it('flashes a newly added block\'s row, same mechanism as SpacePage.jsx', async () => {
    api.getBlocksForSpace
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'new-id', type: 'text', content: { lines: [] }, properties: { workspaces: ['ws-1'] }, updated_at: 'v2' },
      ]);
    api.addBlockToSpace.mockResolvedValue({ id: 'new-id', changeSummary: 'Added a text entry to "My Space"' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Add a new Tool to this Workspace');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));

    await waitFor(() => expect(document.getElementById('block-new-id')).toHaveAttribute('data-highlighted', 'true'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('shows non-member blocks to pull in, and pulling one in adds this Workspace to it', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { text: 'Elsewhere on the Space' }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Pull in a Tool already on this Space');
    expect(screen.getByText(/Elsewhere on the Space/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Pull in' }));
    await waitFor(() => expect(api.updateBlockWorkspaces).toHaveBeenCalledWith('b1', ['ws-1']));
  });

  it('hides the "pull in" section when every block is already a member', async () => {
    renderPage();
    await screen.findByText('Add a new Tool to this Workspace');
    expect(screen.queryByText('Pull in a Tool already on this Space')).not.toBeInTheDocument();
  });
});

describe('WorkspacePage: deleting the Workspace', () => {
  it('deletes the Workspace after confirming, and navigates back to the Space', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete this Workspace' }));
    const dialog = screen.getByText('Delete the Workspace "Focus Area"? Its Tools stay on the Space.').closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteWorkspace).toHaveBeenCalledWith('ws-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/space-1');
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete this Workspace' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteWorkspace).not.toHaveBeenCalled();
  });
});
