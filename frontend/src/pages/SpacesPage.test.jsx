import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SpacesPage from './SpacesPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <SpacesPage />
      </ConfirmDialogProvider>
    </MemoryRouter>
  );

function space(overrides = {}) {
  return {
    id: 's1',
    title: 'A Space',
    status: 'active',
    tags: [],
    categories: [],
    goal: null,
    due_date: null,
    isOverdue: false,
    relationDensity: 0,
    openTensionCount: 0,
    milestoneStats: { reached: 0, total: 0 },
    updated_at: '2026-09-01 10:00:00',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpaces.mockResolvedValue([]);
  api.deleteSpace.mockResolvedValue({});
});

describe('SpacesPage', () => {
  it('groups Spaces under their status', async () => {
    api.getSpaces.mockResolvedValue([space(), space({ id: 's2', title: 'Older', status: 'dormant' })]);
    renderPage();
    await screen.findByRole('heading', { name: /active/ });
    const headings = [...document.querySelectorAll('.space-index-status')].map((h) => h.textContent);
    expect(headings.some((h) => h.includes('active'))).toBe(true);
    expect(headings.some((h) => h.includes('dormant'))).toBe(true);
  });

  it('omits a status nobody is using rather than showing an empty group', async () => {
    api.getSpaces.mockResolvedValue([space()]);
    renderPage();
    await screen.findByRole('heading', { name: /active/ });
    expect(document.querySelectorAll('.space-index-status')).toHaveLength(1);
  });

  it('shows what the Dashboard rows never did -- unresolved and Milestone progress', async () => {
    api.getSpaces.mockResolvedValue([
      space({ relationDensity: 3, openTensionCount: 2, milestoneStats: { reached: 1, total: 4 } }),
    ]);
    renderPage();
    await waitFor(() => expect(document.querySelector('.space-index-meta')).toBeTruthy());
    const meta = document.querySelector('.space-index-meta').textContent;
    expect(meta).toContain('3 connected');
    expect(meta).toContain('2 open');
    expect(meta).toContain('1/4 milestones');
  });

  it('filters on title and on what a Space is working toward', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([
      space({ title: 'Alpha' }),
      space({ id: 's2', title: 'Beta', goal: 'understand feedback' }),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Alpha' });
    await user.type(screen.getByLabelText('Filter Spaces'), 'feedback');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
  });

  it('reorders on the chosen sort', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([
      space({ id: 's1', title: 'Zebra', openTensionCount: 5 }),
      space({ id: 's2', title: 'Apple', openTensionCount: 0 }),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Zebra' });
    await user.selectOptions(screen.getByRole('combobox'), 'title');
    await waitFor(() => {
      const titles = [...document.querySelectorAll('.space-index-title')].map((n) => n.textContent);
      expect(titles).toEqual(['Apple', 'Zebra']);
    });
  });

  it('deletes through the themed confirm, telling you it goes to the trash', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([space()]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).toBeTruthy());
    const dialog = document.querySelector('.confirm-dialog');
    expect(within(dialog).getByText(/go to the trash/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'A Space');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteSpace).toHaveBeenCalledWith('s1'));
  });

  it('offers no delete on the Test Space', async () => {
    api.getSpaces.mockResolvedValue([space({ isTestSpace: true })]);
    renderPage();
    await screen.findByRole('link', { name: 'A Space' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('surfaces a failure rather than an empty page', async () => {
    api.getSpaces.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Could not load Spaces: Nope')).toBeInTheDocument();
  });
});
