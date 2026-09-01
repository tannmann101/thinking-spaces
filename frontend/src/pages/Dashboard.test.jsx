import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeSpace(overrides = {}) {
  return {
    id: 'space-1',
    title: 'A Space',
    status: 'nascent',
    tags: [],
    due_date: null,
    isOverdue: false,
    isTestSpace: false,
    origin: null,
    updated_at: '2024-06-01 12:00:00',
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <Dashboard />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpaces.mockResolvedValue([]);
  api.getOverdueReviews.mockResolvedValue([]);
  api.getRecentTrail.mockResolvedValue([]);
  api.getResurfaceSuggestion.mockResolvedValue(null);
  api.getSpacesByTag.mockResolvedValue([]);
});

describe('Dashboard: Space list', () => {
  it('shows a loading state, then the Space list once fetched', async () => {
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'My First Space' })]);
    renderDashboard();
    expect(screen.getByText('Loading spaces...')).toBeInTheDocument();
    expect(await screen.findByText('My First Space')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no Spaces at all', async () => {
    renderDashboard();
    expect(await screen.findByText('No spaces yet. Create your first one to get started.')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    api.getSpaces.mockRejectedValue(new Error('Network down'));
    renderDashboard();
    expect(await screen.findByText('Could not load spaces: Network down')).toBeInTheDocument();
  });

  it('shows an Overdue badge for an overdue Space', async () => {
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'Late Space', due_date: '2000-01-01', isOverdue: true })]);
    renderDashboard();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
  });

  it('shows a TEST SPACE flag and no Delete button for the Test Space', async () => {
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'Test Space', isTestSpace: true })]);
    renderDashboard();
    await screen.findByText('TEST SPACE');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows tag chips for a Space that has tags', async () => {
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'Tagged', tags: ['resource', 'book'] })]);
    renderDashboard();
    await screen.findByText('Tagged');
    expect(screen.getByText('resource')).toBeInTheDocument();
    expect(screen.getByText('book')).toBeInTheDocument();
  });
});

describe('Dashboard: search and status filter', () => {
  it('filters the Space list by title as you type', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([makeSpace({ id: 'a', title: 'Alpha' }), makeSpace({ id: 'b', title: 'Beta' })]);
    renderDashboard();
    await screen.findByText('Alpha');

    await user.type(screen.getByPlaceholderText('Search Spaces by title...'), 'Alp');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('shows a "no matches" message when the search matches nothing', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'Alpha' })]);
    renderDashboard();
    await screen.findByText('Alpha');
    await user.type(screen.getByPlaceholderText('Search Spaces by title...'), 'zzz');
    expect(await screen.findByText('No Spaces match “zzz”.')).toBeInTheDocument();
  });

  it('filters by status when a status chip is clicked, and toggles off on a second click', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([
      makeSpace({ id: 'a', title: 'Nascent one', status: 'nascent' }),
      makeSpace({ id: 'b', title: 'Mature one', status: 'mature' }),
    ]);
    renderDashboard();
    await screen.findByText('Nascent one');
    // Both the filter chip and the Mature Space's own status-pill show
    // the bare word "mature" -- scope to the filter strip specifically.
    const matureChip = [...document.querySelectorAll('.category-filter-tab')].find((el) => el.textContent === 'mature');

    await user.click(matureChip);
    expect(screen.queryByText('Nascent one')).not.toBeInTheDocument();
    expect(screen.getByText('Mature one')).toBeInTheDocument();

    await user.click(matureChip);
    expect(screen.getByText('Nascent one')).toBeInTheDocument();
  });
});

describe('Dashboard: deleting a Space', () => {
  it('deletes a Space once the type-to-confirm dialog matches, and refetches the list', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValueOnce([makeSpace({ title: 'Doomed Space' })]).mockResolvedValueOnce([]);
    api.deleteSpace.mockResolvedValue(null);
    renderDashboard();
    await screen.findByText('Doomed Space');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const input = await screen.findByPlaceholderText('Type "Doomed Space" to confirm');
    await user.type(input, 'Doomed Space');
    const dialog = input.closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteSpace).toHaveBeenCalledWith('space-1'));
    expect(api.getSpaces).toHaveBeenCalledTimes(2);
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([makeSpace({ title: 'Safe Space' })]);
    renderDashboard();
    await screen.findByText('Safe Space');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByPlaceholderText('Type "Safe Space" to confirm');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.deleteSpace).not.toHaveBeenCalled();
  });
});

describe('Dashboard: digests', () => {
  it('shows the Overdue for review digest when there are overdue items', async () => {
    api.getOverdueReviews.mockResolvedValue([
      { spaceId: 'a', spaceTitle: 'A Space', item: { id: '1', text: 'Meeting notes', reviewBy: '2000-01-01' } },
    ]);
    renderDashboard();
    expect(await screen.findByText('Overdue for review')).toBeInTheDocument();
    expect(screen.getByText(/Meeting notes/)).toBeInTheDocument();
  });

  it('hides the Overdue digest entirely when there is nothing overdue', async () => {
    renderDashboard();
    await screen.findByText('No spaces yet. Create your first one to get started.');
    expect(screen.queryByText('Overdue for review')).not.toBeInTheDocument();
  });

  it('shows the Resources digest, badging an internally-produced (promoted) Resource', async () => {
    api.getSpacesByTag.mockImplementation((tag) =>
      Promise.resolve(tag === 'resource' ? [{ id: 'r1', title: 'A Book', tags: ['resource'], origin: 'internal' }] : [])
    );
    renderDashboard();
    expect(await screen.findByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('A Book')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  it('shows the Syntheses digest, badging one already promoted to Resource status', async () => {
    api.getSpacesByTag.mockImplementation((tag) =>
      Promise.resolve(tag === 'synthesis' ? [{ id: 's1', title: 'My Essay', tags: ['synthesis', 'resource'] }] : [])
    );
    renderDashboard();
    expect(await screen.findByText('Syntheses')).toBeInTheDocument();
    expect(screen.getByText('↑ Resource')).toBeInTheDocument();
  });

  it('shows the resurface suggestion when one is returned', async () => {
    api.getResurfaceSuggestion.mockResolvedValue({ id: 'r1', title: 'Forgotten Space', status: 'dormant', updated_at: '2024-01-01 00:00:00' });
    renderDashboard();
    expect(await screen.findByText('Maybe revisit...')).toBeInTheDocument();
    expect(screen.getByText('Forgotten Space')).toBeInTheDocument();
  });
});

describe('Dashboard: navigation', () => {
  it('links to the three creation flows', async () => {
    renderDashboard();
    await screen.findByText('No spaces yet. Create your first one to get started.');
    expect(screen.getByRole('link', { name: '+ New Space' })).toHaveAttribute('href', '/spaces/new');
    expect(screen.getByRole('link', { name: '+ New Resource' })).toHaveAttribute('href', '/resources/new');
    expect(screen.getByRole('link', { name: '+ New Synthesis' })).toHaveAttribute('href', '/synthesis/new');
  });

  it('shows the Insights banner linking to /insights', async () => {
    renderDashboard();
    await screen.findByText('No spaces yet. Create your first one to get started.');
    expect(screen.getByRole('link', { name: /What's actually going on/ })).toHaveAttribute('href', '/insights');
  });
});
