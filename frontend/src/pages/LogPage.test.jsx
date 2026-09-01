import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LogPage from './LogPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <LogPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LogPage', () => {
  it('shows a loading state, then the stats and entries once fetched', async () => {
    api.getActivity.mockResolvedValue({
      stats: { totalCount: 5, last7Days: 2, mostActive: { space_title: 'Busy Space', count: 3 } },
      entries: [
        { id: '1', kind: 'space_created', summary: 'Created "Busy Space"', space_id: 'sp-1', created_at: '2024-06-01 12:00:00' },
        { id: '2', kind: 'template_created', summary: 'Created Template "A Template"', space_id: null, created_at: '2024-06-01 11:00:00' },
      ],
    });
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Busy Space')).toBeInTheDocument();
    expect(screen.getByText('3 events')).toBeInTheDocument();

    const spaceLink = screen.getByRole('link', { name: 'Created "Busy Space"' });
    expect(spaceLink).toHaveAttribute('href', '/spaces/sp-1');
    expect(screen.getByText('Created Template "A Template"')).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    api.getActivity.mockRejectedValue(new Error('Down'));
    renderPage();
    expect(await screen.findByText('Could not load the Log: Down')).toBeInTheDocument();
  });

  it('shows an empty-state message when there is no activity yet', async () => {
    api.getActivity.mockResolvedValue({
      stats: { totalCount: 0, last7Days: 0, mostActive: null },
      entries: [],
    });
    renderPage();
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('labels an entry kind using KIND_LABELS, falling back to the raw kind for an unknown one', async () => {
    api.getActivity.mockResolvedValue({
      stats: { totalCount: 1, last7Days: 1, mostActive: null },
      entries: [{ id: '1', kind: 'mystery_kind', summary: 'Something happened', space_id: null, created_at: '2024-06-01 00:00:00' }],
    });
    renderPage();
    expect(await screen.findByText('mystery_kind')).toBeInTheDocument();
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });
});

describe('LogPage: day grouping and pagination', () => {
  it('groups entries under one heading per calendar day, oldest group last', async () => {
    api.getActivity.mockResolvedValue({
      stats: { totalCount: 3, last7Days: 3, mostActive: null },
      entries: [
        { id: '1', kind: 'space_created', summary: 'First on day two', space_id: null, created_at: '2024-06-02 09:00:00' },
        { id: '2', kind: 'space_created', summary: 'Second on day one', space_id: null, created_at: '2024-06-01 15:00:00' },
        { id: '3', kind: 'space_created', summary: 'First on day one', space_id: null, created_at: '2024-06-01 09:00:00' },
      ],
    });
    renderPage();
    await screen.findByText('First on day two');

    const headings = document.querySelectorAll('.log-day-heading');
    expect(headings).toHaveLength(2);
    // Newest day heading first, matching the already-newest-first entry order.
    expect(headings[0].textContent).toContain('June 2, 2024');
    expect(headings[1].textContent).toContain('June 1, 2024');
    // Both day-one entries land under that one heading, not two.
    const dayOneGroup = headings[1].closest('.log-day-group');
    expect(dayOneGroup.querySelectorAll('li')).toHaveLength(2);
  });

  it('shows only the first page of entries, revealing more on "Show more"', async () => {
    const user = userEvent.setup();
    const entries = Array.from({ length: 45 }, (_, i) => ({
      id: `e${i}`,
      kind: 'space_created',
      summary: `Event ${i}`,
      space_id: null,
      created_at: '2024-06-01 09:00:00',
    }));
    api.getActivity.mockResolvedValue({ stats: { totalCount: 45, last7Days: 45, mostActive: null }, entries });
    renderPage();
    await screen.findByText('Event 0');

    expect(document.querySelectorAll('.log-list li')).toHaveLength(40);
    expect(screen.getByText('(40 of 45 shown)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(document.querySelectorAll('.log-list li')).toHaveLength(45);
    expect(screen.queryByText('Show more', { exact: false })).not.toBeInTheDocument();
  });
});
