import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TrailSpine from './TrailSpine.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function activityRow(overrides = {}) {
  return {
    id: 'a1',
    source: 'activity',
    kind: 'block_edited',
    summary: 'Edited a text entry',
    block_id: 'b1',
    event_count: 1,
    created_at: '2026-01-01 10:00:00',
    ...overrides,
  };
}

function trailRow(overrides = {}) {
  return {
    id: 't1',
    source: 'trail',
    kind: 'manual',
    summary: 'why this matters',
    note: 'why this matters',
    skeleton_snapshot: { lanes: {}, articulation: '' },
    created_at: '2026-01-01 11:00:00',
    ...overrides,
  };
}

function renderSpine(entries) {
  return render(
    <MemoryRouter>
      <TrailSpine spaceId="space-1" entries={entries} onEntryAdded={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('TrailSpine: recorded activity', () => {
  it('shows recorded activity, which is what stopped Trail being empty', () => {
    renderSpine([activityRow()]);
    expect(screen.getByText('Edited a text entry')).toBeInTheDocument();
    expect(screen.queryByText('No history yet.')).not.toBeInTheDocument();
  });

  it('says how many occurrences a coalesced row stands for', () => {
    renderSpine([activityRow({ event_count: 5 })]);
    expect(document.querySelector('.trail-activity-count').textContent).toContain('5');
  });

  it('shows no count for a row that happened once', () => {
    renderSpine([activityRow({ event_count: 1 })]);
    expect(document.querySelector('.trail-activity-count')).toBeNull();
  });

  it('links through to the entry it is about', () => {
    renderSpine([activityRow()]);
    expect(screen.getByRole('link', { name: 'Edited a text entry' })).toHaveAttribute(
      'href',
      '/spaces/space-1?highlight=b1'
    );
  });

  it('leaves a row with no entry behind it as plain text', () => {
    renderSpine([activityRow({ kind: 'space_status_changed', summary: 'Status changed to mature', block_id: null })]);
    expect(screen.queryByRole('link', { name: 'Status changed to mature' })).not.toBeInTheDocument();
    expect(screen.getByText(/Status changed to mature/)).toBeInTheDocument();
  });

  // An activity row has no Skeleton snapshot, so offering Rewind on it
  // would promise a comparison it can't produce.
  it('does not offer Rewind on a recorded activity row', async () => {
    const user = userEvent.setup();
    renderSpine([activityRow()]);
    await user.click(screen.getByText('Edited a text entry'));
    expect(screen.queryByRole('button', { name: 'Compare to Now' })).not.toBeInTheDocument();
  });
});

describe('TrailSpine: real Trail entries', () => {
  it('still expands a Trail entry and offers Rewind', async () => {
    const user = userEvent.setup();
    api.getCurrentSkeleton.mockResolvedValue({ lanes: {}, articulation: '' });
    renderSpine([trailRow()]);

    await user.click(screen.getByText(/Note —/));
    await user.click(screen.getByRole('button', { name: 'Compare to Now' }));
    await waitFor(() => expect(api.getCurrentSkeleton).toHaveBeenCalledWith('space-1'));
    expect(screen.getByRole('button', { name: 'Return to Now' })).toBeInTheDocument();
  });

  it('renders both kinds together, in the order given', () => {
    renderSpine([activityRow(), trailRow()]);
    const rows = [...document.querySelectorAll('.trail-list li')];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass('trail-activity-row');
    expect(rows[1]).not.toHaveClass('trail-activity-row');
  });

  it('still lets a note be added', async () => {
    const user = userEvent.setup();
    api.addTrailNote.mockResolvedValue({});
    renderSpine([]);
    await user.type(screen.getByPlaceholderText('Add a note to the Trail...'), 'a thought');
    await user.click(within(document.querySelector('.add-item-row')).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(api.addTrailNote).toHaveBeenCalledWith('space-1', 'a thought'));
  });
});
