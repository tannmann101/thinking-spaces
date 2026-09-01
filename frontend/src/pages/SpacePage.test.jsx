import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SpacePage from './SpacePage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeSpace(overrides = {}) {
  return {
    id: 'space-1',
    title: 'My Space',
    status: 'nascent',
    tags: [],
    categories: [],
    goal: null,
    accent: null,
    origin: null,
    due_date: null,
    isOverdue: false,
    isTestSpace: false,
    relationDensity: 0,
    openTensionCount: 0,
    created_at: '2024-01-01 00:00:00',
    updated_at: '2024-01-01 00:00:00',
    ...overrides,
  };
}

function renderPage(path = '/spaces/space-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/spaces/:id" element={<SpacePage />} />
        </Routes>
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpace.mockResolvedValue(makeSpace());
  api.getBlocksForSpace.mockResolvedValue([]);
  api.getWorkspacesForSpace.mockResolvedValue([]);
  api.getBacklinksForSpace.mockResolvedValue([]);
  api.getTrailEntries.mockResolvedValue([]);
  api.updateSpace.mockResolvedValue({});
});

describe('SpacePage: loading and errors', () => {
  it('shows a loading state, then the Space once fetched', async () => {
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('My Space')).toBeInTheDocument();
  });

  it('shows an error when the Space fails to load', async () => {
    api.getSpace.mockRejectedValue(new Error('Not found'));
    renderPage();
    expect(await screen.findByText('Could not load Space: Not found')).toBeInTheDocument();
  });
});

describe('SpacePage: details panel', () => {
  it('groups the accent/working-toward/due-date/tags/categories fields into one panel', async () => {
    renderPage();
    await screen.findByText('My Space');
    const panel = document.querySelector('.space-details-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.querySelector('.category-row')).toBeInTheDocument(); // AccentPicker
    expect(panel.querySelector('.working-toward')).toBeInTheDocument();
    expect(panel.querySelector('.due-date-row')).toBeInTheDocument();
    expect(panel.querySelector('.tag-row')).toBeInTheDocument();
  });
});

describe('SpacePage: identity fields', () => {
  it('edits the title', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('My Space'));
    const input = screen.getByDisplayValue('My Space');
    await user.clear(input);
    await user.type(input, 'Renamed Space');
    await user.tab();
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { title: 'Renamed Space' }));
  });

  it('cycles the status on click', async () => {
    const user = userEvent.setup();
    renderPage();
    const pill = await screen.findByTitle('Click to cycle: nascent -> developing -> mature -> dormant');
    await user.click(pill);
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { status: 'developing' }));
  });

  it('shows a TEST SPACE flag and hides the delete control for the Test Space', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ isTestSpace: true }));
    renderPage();
    await screen.findByText('TEST SPACE');
    expect(screen.queryByRole('button', { name: 'Delete this Space' })).not.toBeInTheDocument();
  });

  it('shows an Origin badge when the Space has one', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ origin: 'external' }));
    renderPage();
    expect(await screen.findByText('External')).toBeInTheDocument();
  });

  it('edits the "working toward" goal', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('(not set -- click to add)'));
    const input = document.querySelector('.working-toward input');
    await user.type(input, 'Ship it');
    await user.tab();
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { goal: 'Ship it' }));
  });

  it('sets a due date', async () => {
    renderPage();
    await screen.findByText('My Space');
    const input = document.querySelector('.due-date-row input[type="date"]');
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { dueDate: '2026-12-25' }));
  });

  it('shows an Overdue badge for an overdue Space', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ due_date: '2000-01-01', isOverdue: true }));
    renderPage();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
  });
});

describe('SpacePage: tags', () => {
  it('adds a tag', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    await user.type(screen.getByPlaceholderText('+ tag'), 'resource{Enter}');
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { tags: ['resource'] }));
  });

  it('removes an existing tag', async () => {
    const user = userEvent.setup();
    api.getSpace.mockResolvedValue(makeSpace({ tags: ['resource'] }));
    renderPage();
    await user.click(await screen.findByTitle('Remove tag'));
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { tags: [] }));
  });
});

describe('SpacePage: PromoteToResource', () => {
  it('shows the promote action only for an unpromoted, internal Synthesis', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ origin: 'internal', tags: ['synthesis'] }));
    renderPage();
    expect(await screen.findByRole('button', { name: '↑ Promote to Resource' })).toBeInTheDocument();
  });

  it('hides it for an ordinary Space, and for an already-promoted Synthesis', async () => {
    renderPage();
    await screen.findByText('My Space');
    expect(screen.queryByRole('button', { name: '↑ Promote to Resource' })).not.toBeInTheDocument();
  });

  it('promoting adds the resource tag', async () => {
    const user = userEvent.setup();
    api.getSpace.mockResolvedValue(makeSpace({ origin: 'internal', tags: ['synthesis'] }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '↑ Promote to Resource' }));
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { tags: ['synthesis', 'resource'] }));
  });
});

describe('SpacePage: Categories', () => {
  it('adds a Category, which then shows a filter strip', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    await user.type(screen.getByPlaceholderText('+ category'), 'Risk{Enter}');
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { categories: ['Risk'] }));
  });

  it('filters blocks by Category', async () => {
    const user = userEvent.setup();
    api.getSpace.mockResolvedValue(makeSpace({ categories: ['Risk', 'Timing'] }));
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'In Risk', tag: null }] }, properties: { categories: ['Risk'] }, updated_at: 'v1' },
      { id: 'b2', type: 'text', content: { lines: [{ id: 'l2', text: 'In Timing', tag: null }] }, properties: { categories: ['Timing'] }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('In Risk');

    expect(screen.getByText('Risk (1)')).toBeInTheDocument();
    expect(screen.getByText('Timing (1)')).toBeInTheDocument();
    expect(screen.getByText('All (2)')).toBeInTheDocument();

    const riskTab = [...document.querySelectorAll('.category-filter-tab')].find((el) => el.textContent.startsWith('Risk'));
    await user.click(riskTab);
    expect(screen.getByText('In Risk')).toBeInTheDocument();
    expect(screen.queryByText('In Timing')).not.toBeInTheDocument();

    const allTab = [...document.querySelectorAll('.category-filter-tab')].find((el) => el.textContent.startsWith('All'));
    await user.click(allTab);
    expect(screen.getByText('In Timing')).toBeInTheDocument();
  });
});

describe('SpacePage: block type filter', () => {
  it('only shows the type filter strip when more than one Block type is present', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Only text', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Only text');
    expect(screen.queryByText('All types (1)')).not.toBeInTheDocument();
  });

  it('filters blocks by type once more than one type exists, each tab showing its own count', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'A text block', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'list', content: { items: [] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('A text block');
    expect(screen.getByText('All types (2)')).toBeInTheDocument();
    expect(screen.getByText('Text (1)')).toBeInTheDocument();
    expect(screen.getByText('List (1)')).toBeInTheDocument();

    const listTab = [...document.querySelectorAll('.category-filter-tab')].find((el) => el.textContent.startsWith('List'));
    await user.click(listTab);
    expect(screen.queryByText('A text block')).not.toBeInTheDocument();
  });
});

describe('SpacePage: block feed actions', () => {
  it('shows "No blocks yet." for an empty Space', async () => {
    renderPage();
    expect(await screen.findByText('No blocks yet.')).toBeInTheDocument();
  });

  it('adds a block via NewBlockForm', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No blocks yet.');
    await user.click(screen.getByRole('button', { name: '+ Add Block' }));
    await waitFor(() => expect(api.addBlockToSpace).toHaveBeenCalledWith('space-1', expect.objectContaining({ type: 'text' })));
  });

  it('shows the selected Tool\'s own description, updating as the type changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No blocks yet.');
    expect(screen.getByText('A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Block type:'), 'assessment');
    expect(screen.getByText('A judgment on something, with supporting points and a confidence marker.')).toBeInTheDocument();
  });

  it('removes a block after confirming', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Doomed block', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Doomed block');

    await user.click(screen.getByRole('button', { name: 'Remove block' }));
    const dialog = screen.getByText('Remove this block? This cannot be undone.').closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteBlockApi).toHaveBeenCalledWith('b1'));
  });

  it('does not remove a block when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Safe block', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Safe block');
    await user.click(screen.getByRole('button', { name: 'Remove block' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteBlockApi).not.toHaveBeenCalled();
  });

  it('moves a block down, and disables Move up for the first block / Move down for the last', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'First', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'text', content: { lines: [{ id: 'l2', text: 'Second', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('First');

    const [firstMoveUp] = screen.getAllByRole('button', { name: 'Move up' });
    const [, secondMoveDown] = screen.getAllByRole('button', { name: 'Move down' });
    expect(firstMoveUp).toBeDisabled();
    expect(secondMoveDown).toBeDisabled();

    const [firstMoveDown] = screen.getAllByRole('button', { name: 'Move down' });
    await user.click(firstMoveDown);
    await waitFor(() => expect(api.moveBlockInSpace).toHaveBeenCalledWith('space-1', 'b1', 1));
  });

  it('shows an unknown-type fallback for a Block type not in the registry', async () => {
    api.getBlocksForSpace.mockResolvedValue([{ id: 'b1', type: 'mystery-type', content: {}, properties: {}, updated_at: 'v1' }]);
    renderPage();
    expect(await screen.findByText('Unknown block type: mystery-type')).toBeInTheDocument();
  });
});

describe('SpacePage: Workspaces', () => {
  it('lists existing Workspaces as cards linking to their own page', async () => {
    api.getWorkspacesForSpace.mockResolvedValue([{ id: 'ws-1', name: 'Focus Area' }]);
    renderPage();
    const link = await screen.findByRole('link', { name: 'Focus Area' });
    expect(link).toHaveAttribute('href', '/spaces/space-1/workspaces/ws-1');
  });

  it('creates a new Workspace', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    await user.type(screen.getByPlaceholderText('+ New Workspace'), 'New Area');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith('space-1', 'New Area'));
  });
});

describe('SpacePage: backlinks', () => {
  it('shows which Spaces reference this one', async () => {
    api.getBacklinksForSpace.mockResolvedValue([{ blockId: 'b1', sourceSpaceId: 'other', sourceSpaceTitle: 'Other Space', note: 'why it matters' }]);
    renderPage();
    expect(await screen.findByText('Referenced by:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Other Space' })).toHaveAttribute('href', '/spaces/other');
    expect(screen.getByText(/why it matters/)).toBeInTheDocument();
  });

  it('shows nothing when there are no backlinks', async () => {
    renderPage();
    await screen.findByText('My Space');
    expect(screen.queryByText('Referenced by:')).not.toBeInTheDocument();
  });
});

describe('SpacePage: deleting the Space', () => {
  it('deletes and navigates home once the title is typed back correctly', async () => {
    const user = userEvent.setup();
    api.deleteSpace.mockResolvedValue(null);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete this Space' }));

    const input = await screen.findByPlaceholderText('Type "My Space" to confirm');
    await user.type(input, 'My Space');
    const dialog = input.closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteSpace).toHaveBeenCalledWith('space-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
