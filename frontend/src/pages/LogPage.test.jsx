import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
