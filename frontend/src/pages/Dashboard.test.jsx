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
    status: 'active',
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
  it('hands off to the Spaces index rather than carrying the whole list', async () => {
    api.getSpaces.mockResolvedValue([makeSpace()]);
    renderDashboard();
    const link = await screen.findByRole('link', { name: /See all 1/ });
    expect(link).toHaveAttribute('href', '/spaces');
  });

  it('caps how many Spaces it shows, since the full index lives elsewhere', async () => {
    api.getSpaces.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makeSpace({ id: `s${i}`, title: `Space ${i}` }))
    );
    renderDashboard();
    await screen.findByRole('link', { name: /See all 10/ });
    expect(document.querySelectorAll('.space-card').length).toBeLessThan(10);
  });

  it('always shows an overdue Space, even past the cap', async () => {
    api.getSpaces.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, i) => makeSpace({ id: `s${i}`, title: `Space ${i}` })),
      makeSpace({ id: 'late', title: 'Overdue One', due_date: '2020-01-01', isOverdue: true }),
    ]);
    renderDashboard();
    expect(await screen.findByRole('link', { name: 'Overdue One' })).toBeInTheDocument();
  });

  it('no longer offers search, a status filter or delete -- those moved to the Spaces index', async () => {
    api.getSpaces.mockResolvedValue([makeSpace()]);
    renderDashboard();
    await screen.findByRole('link', { name: /See all/ });
    expect(screen.queryByPlaceholderText(/Search Spaces/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

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

});

describe('Dashboard: digests', () => {
  it('shows the Overdue for review digest when there are overdue items', async () => {
    api.getOverdueReviews.mockResolvedValue([
      { spaceId: 'a', spaceTitle: 'A Space', blockId: 'block-a', item: { id: '1', text: 'Meeting notes', reviewBy: '2000-01-01' } },
    ]);
    renderDashboard();
    expect(await screen.findByText('Overdue for review')).toBeInTheDocument();
    expect(screen.getByText(/Meeting notes/)).toBeInTheDocument();
    // Deep-links straight to the overdue entry, not just the Space.
    expect(screen.getByRole('link', { name: 'A Space' })).toHaveAttribute('href', '/spaces/a?highlight=block-a');
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

  it('distinguishes a reached Milestone from one still targeted, deep-linking each to its own entry', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({
        1: { milestones: [{ id: 'block-3', label: 'Shipped it', reached: true, spaceId: 'sp-3', spaceTitle: 'Done Space' }] },
        4: { milestones: [{ id: 'block-4', label: 'Ship it', reached: false, spaceId: 'sp-4', spaceTitle: 'Pending Space' }] },
      })
    );
    renderDashboard();
    expect(await screen.findByText(/reached: Shipped it/)).toBeInTheDocument();
    expect(screen.getByText(/target: Ship it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Done Space' })).toHaveAttribute('href', '/spaces/sp-3?highlight=block-3');
    expect(screen.getByRole('link', { name: 'Pending Space' })).toHaveAttribute('href', '/spaces/sp-4?highlight=block-4');
  });

  it('distinguishes a completed Session from one still running, and shows its Project', async () => {
    api.getWeekCalendar.mockResolvedValue(
      makeWeekDays({
        2: {
          sessions: [
            { id: 'block-5', label: 'Drafting', durationMinutes: 45, isRunning: false, spaceId: 'sp-5', spaceTitle: 'Writing Space', projectName: 'Ship the redesign' },
          ],
        },
        3: { sessions: [{ id: 'block-6', label: 'Editing', durationMinutes: null, isRunning: true, spaceId: 'sp-6', spaceTitle: 'Writing Space', projectName: null }] },
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
    expect(screen.getByRole('link', { name: /Aggregate trends across every Space/ })).toHaveAttribute('href', '/insights');
  });
});
