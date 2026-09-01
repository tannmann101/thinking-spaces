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
  api.getWeekCalendar.mockResolvedValue([]);
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
    // the word "mature" -- scope to the filter strip specifically. The
    // chip also carries a count now, so match on a prefix rather than
    // the exact bare word.
    const matureChip = [...document.querySelectorAll('.category-filter-tab')].find((el) =>
      el.textContent.startsWith('mature ')
    );

    await user.click(matureChip);
    expect(screen.queryByText('Nascent one')).not.toBeInTheDocument();
    expect(screen.getByText('Mature one')).toBeInTheDocument();

    await user.click(matureChip);
    expect(screen.getByText('Nascent one')).toBeInTheDocument();
  });

  it('shows a count on each status tab, reflecting the current search text', async () => {
    api.getSpaces.mockResolvedValue([
      makeSpace({ id: 'a', title: 'Alpha', status: 'nascent' }),
      makeSpace({ id: 'b', title: 'Beta', status: 'mature' }),
      makeSpace({ id: 'c', title: 'Gamma', status: 'mature' }),
    ]);
    renderDashboard();
    await screen.findByText('Alpha');
    const tabs = [...document.querySelectorAll('.category-filter-tab')].map((el) => el.textContent);
    expect(tabs).toContain('All (3)');
    expect(tabs).toContain('mature (2)');
    expect(tabs).toContain('nascent (1)');
    expect(tabs).toContain('developing (0)');
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

// A 7-day getWeekCalendar payload with everything empty by default --
// each test overrides just the one day/field it cares about, same
// "start from a known-good shape" helper pattern makeSpace() uses above.
function makeWeekDays(overrides = {}) {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2024-06-0${i + 2}`, // a Sunday-Saturday week, arbitrary but ordered
    isToday: i === 3,
    isPast: i < 3,
    trail: [],
    dueSpaces: [],
    milestones: [],
    sessions: [],
  }));
  Object.entries(overrides).forEach(([index, patch]) => {
    days[index] = { ...days[index], ...patch };
  });
  return days;
}

describe('Dashboard: Week calendar', () => {
  it('hides the digest entirely when every day is empty', async () => {
    api.getWeekCalendar.mockResolvedValue(makeWeekDays());
    renderDashboard();
    await screen.findByText('No spaces yet. Create your first one to get started.');
    expect(screen.queryByText(/^This week/)).not.toBeInTheDocument();
  });

  it('shows a Trail entry under its own day, linking to its Space', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({ 3: { trail: [{ id: 't1', space_id: 'sp-1', spaceTitle: 'A Space', summary: 'wrote a paragraph' }] } })
    );
    renderDashboard();
    expect(await screen.findByText(/wrote a paragraph/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A Space' })).toHaveAttribute('href', '/spaces/sp-1');
  });

  it('shows a Space due that day as "due"', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({ 5: { dueSpaces: [{ spaceId: 'sp-2', spaceTitle: 'Due Space' }] } })
    );
    renderDashboard();
    expect(await screen.findByText(/due/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Due Space' })).toHaveAttribute('href', '/spaces/sp-2');
  });

  it('distinguishes a reached Milestone from one still targeted', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({
        1: { milestones: [{ label: 'Shipped it', reached: true, spaceId: 'sp-3', spaceTitle: 'Done Space' }] },
        4: { milestones: [{ label: 'Ship it', reached: false, spaceId: 'sp-4', spaceTitle: 'Pending Space' }] },
      })
    );
    renderDashboard();
    expect(await screen.findByText(/reached: Shipped it/)).toBeInTheDocument();
    expect(screen.getByText(/target: Ship it/)).toBeInTheDocument();
  });

  it('distinguishes a completed Session from one still running, and shows its Project', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({
        2: {
          sessions: [
            { label: 'Drafting', durationMinutes: 45, isRunning: false, spaceId: 'sp-5', spaceTitle: 'Writing Space', projectName: 'Ship the redesign' },
          ],
        },
        3: { sessions: [{ label: 'Editing', durationMinutes: null, isRunning: true, spaceId: 'sp-6', spaceTitle: 'Writing Space', projectName: null }] },
      })
    );
    renderDashboard();
    expect(await screen.findByText(/logged 45 min: Drafting \(Ship the redesign\)/)).toBeInTheDocument();
    expect(screen.getByText(/session running: Editing/)).toBeInTheDocument();
  });

  it('marks today\'s column distinctly from the others', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({ 3: { trail: [{ id: 't1', space_id: 'sp-1', spaceTitle: 'A Space', summary: 'x' }] } })
    );
    renderDashboard();
    await screen.findByText(/x$/);
    const todayColumns = document.querySelectorAll('.week-day[data-today]');
    expect(todayColumns).toHaveLength(1);
  });
});

describe('Dashboard: Week calendar actions', () => {
  it('marks a Milestone reached from the calendar and refetches the week', async () => {
    const user = userEvent.setup();
    const milestone = {
      id: 'm1',
      content: { label: 'Ship it', reached: false, targetDate: '2024-06-05' },
      label: 'Ship it',
      reached: false,
      spaceId: 'sp-4',
      spaceTitle: 'Pending Space',
      projectName: null,
    };
    api.getWeekCalendar.mockResolvedValue(makeWeekDays({ 4: { milestones: [milestone] } }));
    api.updateBlockContent.mockResolvedValue(null);
    renderDashboard();
    await screen.findByText(/target: Ship it/);

    await user.click(screen.getByRole('button', { name: 'Mark reached' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('m1', expect.objectContaining({ reached: true }))
    );
    expect(api.getWeekCalendar).toHaveBeenCalledTimes(2);
  });

  it('stops a running Session from the calendar', async () => {
    const user = userEvent.setup();
    const session = {
      id: 's1',
      content: { label: 'Editing', startedAt: '2024-06-03T10:00:00.000Z', endedAt: null, durationMinutes: null },
      label: 'Editing',
      durationMinutes: null,
      isRunning: true,
      spaceId: 'sp-6',
      spaceTitle: 'Writing Space',
      projectName: null,
    };
    api.getWeekCalendar.mockResolvedValue(makeWeekDays({ 3: { sessions: [session] } }));
    api.updateBlockContent.mockResolvedValue(null);
    renderDashboard();
    await screen.findByText(/session running: Editing/);

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ endedAt: expect.any(String), durationMinutes: expect.any(Number) })
      )
    );
  });

  it('shows a "Review this week" button only when a Space was genuinely active, and logs one Review per Space', async () => {
    const user = userEvent.setup();
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({
        3: { trail: [{ id: 't1', space_id: 'sp-1', spaceTitle: 'A Space', summary: 'wrote a paragraph' }] },
        4: { milestones: [{ label: 'Shipped it', reached: true, spaceId: 'sp-3', spaceTitle: 'Done Space' }] },
      })
    );
    api.createReview.mockResolvedValue(null);
    renderDashboard();
    const reviewBtn = await screen.findByRole('button', { name: /Review this week \(2 Spaces\)/ });

    await user.click(reviewBtn);
    const dialogMessage = await screen.findByText(/Log a Review for 2 Spaces active this week/);
    const dialog = dialogMessage.closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.createReview).toHaveBeenCalledTimes(2));
    expect(api.createReview).toHaveBeenCalledWith('sp-1');
    expect(api.createReview).toHaveBeenCalledWith('sp-3');
    expect(await screen.findByText('Logged 2 Reviews.')).toBeInTheDocument();
  });

  it('does not show the "Review this week" button when only a due date passed, with nothing actually done', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({ 5: { dueSpaces: [{ spaceId: 'sp-2', spaceTitle: 'Due Space' }] } })
    );
    renderDashboard();
    await screen.findByText(/due/);
    expect(screen.queryByRole('button', { name: /Review this week/ })).not.toBeInTheDocument();
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
