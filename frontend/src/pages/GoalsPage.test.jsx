import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GoalsPage from './GoalsPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function goal(overrides = {}) {
  return { id: 'goal-1', name: 'Understand systems', note: null, spaces: [], projects: [], ...overrides };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <GoalsPage />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getGoals.mockResolvedValue([]);
});

describe('GoalsPage', () => {
  it('shows an empty state when no pursuit has been named yet', async () => {
    renderPage();
    expect(await screen.findByText(/None yet\./)).toBeInTheDocument();
  });

  it('shows an error when the index fails to load', async () => {
    api.getGoals.mockRejectedValue(new Error('Gone'));
    renderPage();
    expect(await screen.findByText('Could not load Goals: Gone')).toBeInTheDocument();
  });

  it('creates a Goal', async () => {
    const user = userEvent.setup();
    api.createGoal.mockResolvedValue(goal());
    renderPage();
    await screen.findByText(/None yet\./);
    await user.type(screen.getByPlaceholderText(/Name a pursuit/), 'Understand systems');
    await user.click(screen.getByRole('button', { name: '+ New Goal' }));
    await waitFor(() => expect(api.createGoal).toHaveBeenCalledWith('Understand systems'));
  });

  // A Goal's whole substance is its reach -- which is exactly what an
  // index of Goals is for.
  it('names every Space working toward it and every Project serving it', async () => {
    api.getGoals.mockResolvedValue([
      goal({
        spaces: [{ spaceId: 's1', spaceTitle: 'My Space' }],
        projects: [{ projectId: 'pr-1', projectName: 'Read the book' }],
      }),
    ]);
    renderPage();
    const card = (await screen.findByText('Understand systems')).closest('.goal-card');
    expect(within(card).getByRole('link', { name: 'My Space' })).toHaveAttribute('href', '/spaces/s1');
    expect(within(card).getByRole('link', { name: 'Read the book' })).toHaveAttribute('href', '/projects/pr-1');
  });

  it('says plainly when nothing is working toward it yet', async () => {
    api.getGoals.mockResolvedValue([goal()]);
    renderPage();
    await screen.findByText('Understand systems');
    expect(screen.getByText('no Spaces yet')).toBeInTheDocument();
    expect(screen.getByText('no Projects yet')).toBeInTheDocument();
  });

  it('renames a Goal in place', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([goal()]);
    api.updateGoal.mockResolvedValue(goal({ name: 'Renamed' }));
    renderPage();
    await user.click(await screen.findByText('Understand systems'));
    const input = screen.getByLabelText('Goal name');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.tab();
    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledWith('goal-1', { name: 'Renamed' }));
  });

  it('attaches a note saying why the pursuit matters', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([goal()]);
    api.updateGoal.mockResolvedValue(goal({ note: 'Kept surfacing' }));
    renderPage();
    await user.click(await screen.findByText('+ why this matters'));
    await user.type(screen.getByLabelText('Goal note'), 'Kept surfacing');
    await user.tab();
    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledWith('goal-1', { note: 'Kept surfacing' }));
  });

  it('deletes a Goal after confirming', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([goal()]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Goal' }));
    const dialog = screen
      .getByText('Delete the Goal "Understand systems"? Spaces and Projects that named it stay exactly as they are.')
      .closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteGoal).toHaveBeenCalledWith('goal-1'));
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([goal()]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Goal' }));
    const dialog = screen.getByText(/Delete the Goal/).closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(api.deleteGoal).not.toHaveBeenCalled());
  });
});
