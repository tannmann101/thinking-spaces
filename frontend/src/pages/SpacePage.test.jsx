import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SpacePage from './SpacePage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

// jsdom doesn't implement scrollIntoView at all (not even as a no-op) --
// only the deep-link highlighting tests below call it, but it has to be
// stubbed for every test in this file since SpacePage's own effect calls
// it unconditionally whenever a ?highlight= param is present.
Element.prototype.scrollIntoView = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeSpace(overrides = {}) {
  return {
    id: 'space-1',
    title: 'My Space',
    status: 'active',
    tags: [],
    categories: [],
    goal: null,
    goalIds: [],
    theme: null,
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
  api.getSpaces.mockResolvedValue([]);
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


// The Details panel shows only the fields that hold something; an empty
// one is opened from the "+ ..." row beside them. See AddDetail.
async function revealDetail(user, label) {
  await user.click(screen.getByRole('button', { name: `+ ${label}` }));
}

describe('SpacePage: details panel', () => {
  it('groups the fields into one panel, showing only what is set', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    const panel = document.querySelector('.space-details-panel');
    expect(panel).toBeInTheDocument();
    // Nothing is set on this Space, so nothing but the add row shows.
    expect(panel.querySelector('.due-date-row')).not.toBeInTheDocument();
    expect(panel.querySelector('.add-detail-row')).toBeInTheDocument();

    await revealDetail(user, 'a due date');
    expect(panel.querySelector('.due-date-row')).toBeInTheDocument();
    await revealDetail(user, 'tags');
    expect(panel.querySelector('.tag-row')).toBeInTheDocument();
  });
});

describe('SpacePage: Think label', () => {
  it('shows a plain, non-collapsible "Think" label above the working feed', async () => {
    renderPage();
    await screen.findByText('My Space');
    const label = screen.getByText('Think');
    expect(label.tagName).toBe('H2');
    expect(label.closest('details')).toBeNull();
  });
});

describe('SpacePage: adaptive density', () => {
  it('starts the details panel collapsed for a Space with no metadata set', async () => {
    renderPage();
    await screen.findByText('My Space');
    expect(document.querySelector('.space-details-panel').open).toBe(false);
  });

  it('starts the details panel expanded when the Space already has a due date', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ due_date: '2026-01-01' }));
    renderPage();
    await screen.findByText('My Space');
    // The panel's open state is set from a *second* effect that only
    // runs once `space` has actually loaded, one render after the title
    // itself first appears -- wait for it rather than assuming it's
    // already settled the instant the title text shows up.
    await waitFor(() => expect(document.querySelector('.space-details-panel').open).toBe(true));
  });

  it.each([
    ['tags', { tags: ['resource'] }],
    ['categories', { categories: ['Risk'] }],
    ['a Goal', { goalIds: ['goal-1'] }],
    ['a theme override', { theme: { accent: 'teal' } }],
  ])('starts the details panel expanded when the Space has %s set, same as due date', async (label, overrides) => {
    api.getSpace.mockResolvedValue(makeSpace(overrides));
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-details-panel').open).toBe(true));
  });

  it('starts expanded for an unpromoted, internal Synthesis, since promoting is something to act on', async () => {
    api.getSpace.mockResolvedValue(makeSpace({ origin: 'internal', tags: ['synthesis'] }));
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-details-panel').open).toBe(true));
  });

  it('lets a collapsed panel be opened manually by clicking its summary', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    const panel = document.querySelector('.space-details-panel');
    expect(panel.open).toBe(false);
    await user.click(screen.getByText('Details'));
    expect(panel.open).toBe(true);
  });

  // Organize (Workspaces+Projects) and Trail gained the same adaptive
  // treatment as the Details panel in the coherence-audit pass -- both
  // used to render at full size even when completely empty, forever.
  it('starts the Organize panel collapsed when the Space has no Workspaces or Projects', async () => {
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-organize-panel').open).toBe(false));
  });

  it('starts the Organize panel expanded once the Space has a Workspace', async () => {
    api.getWorkspacesForSpace.mockResolvedValue([{ id: 'ws-1', space_id: 'space-1', name: 'Focus' }]);
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-organize-panel').open).toBe(true));
  });

  // Trail is never literally empty now -- every Space records its own
  // creation -- so the panel has to look past that or it would always
  // default open, quietly undoing its own adaptive density.
  it('stays collapsed when the only history is the Space being created', async () => {
    api.getTrailEntries.mockResolvedValue([
      { id: 'a1', source: 'activity', kind: 'space_created', summary: 'Created this Space', created_at: '2026-01-01 10:00:00' },
    ]);
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-trail-panel').open).toBe(false));
  });

  it('opens once something has actually happened in the Space', async () => {
    api.getTrailEntries.mockResolvedValue([
      { id: 'a1', source: 'activity', kind: 'space_created', summary: 'Created this Space', created_at: '2026-01-01 10:00:00' },
      { id: 'a2', source: 'activity', kind: 'block_added', summary: 'Added a text entry', created_at: '2026-01-01 10:01:00' },
    ]);
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-trail-panel').open).toBe(true));
  });

  it('starts the Trail panel collapsed when the Space has no history yet', async () => {
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-trail-panel').open).toBe(false));
  });

  it('starts the Trail panel expanded once the Space has any history', async () => {
    api.getTrailEntries.mockResolvedValue([
      { id: 't1', kind: 'auto', summary: 'Added a text entry', note: null, created_at: '2024-01-01 00:00:00' },
    ]);
    renderPage();
    await screen.findByText('My Space');
    await waitFor(() => expect(document.querySelector('.space-trail-panel').open).toBe(true));
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
    const pill = await screen.findByTitle('Click to cycle: dormant -> inactive -> active -> interesting -> mature');
    await user.click(pill);
    await waitFor(() => expect(api.updateSpace).toHaveBeenCalledWith('space-1', { status: 'interesting' }));
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

  it('sets a due date', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('My Space');
    await revealDetail(user, 'a due date');
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
    await revealDetail(user, 'tags');
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
    await revealDetail(user, 'Categories');
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

  // The strip appears once some type actually holds more than one entry:
  // with one of each, every tab reads (1) and sorts nothing.
  it('filters blocks by type once some type holds more than one, each tab showing its count', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'A text block', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b3', type: 'text', content: { lines: [{ id: 'l3', text: 'Another text block', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'list', content: { items: [] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('A text block');
    expect(screen.getByText('All types (3)')).toBeInTheDocument();
    expect(screen.getByText('Writing (2)')).toBeInTheDocument();
    expect(screen.getByText('List (1)')).toBeInTheDocument();

    const listTab = [...document.querySelectorAll('.category-filter-tab')].find((el) => el.textContent.startsWith('List'));
    await user.click(listTab);
    expect(screen.queryByText('A text block')).not.toBeInTheDocument();
  });
});

describe('SpacePage: block feed actions', () => {
  it('shows "No entries yet." for an empty Space', async () => {
    renderPage();
    expect(await screen.findByText('No entries yet.')).toBeInTheDocument();
  });

  it('adds a block via NewBlockForm', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No entries yet.');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    await waitFor(() => expect(api.addBlockToSpace).toHaveBeenCalledWith('space-1', expect.objectContaining({ type: 'text' })));
  });

  it('shows the selected Tool\'s own description, updating as the type changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No entries yet.');
    expect(document.querySelector('.new-block-type-description').textContent).toBe(
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.'
    );

    await user.selectOptions(screen.getByLabelText('Entry type:'), 'claim');
    expect(document.querySelector('.new-block-type-description').textContent).toBe(
      'Something you are asserting, with the points that support it and how settled it feels.'
    );
  });

  it('removes a block after confirming', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Doomed block', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Doomed block');

    await user.click(screen.getByRole('button', { name: 'Remove entry' }));
    const dialog = screen.getByText('Remove this entry? This cannot be undone.').closest('.confirm-dialog');
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
    await user.click(screen.getByRole('button', { name: 'Remove entry' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteBlockApi).not.toHaveBeenCalled();
  });

  // Move up / Move down are gone: reordering is a drag now, so what
  // gets sent is the whole resulting order rather than one step.
  it('reorders by dragging one entry onto another, sending the resulting order', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'First', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'text', content: { lines: [{ id: 'l2', text: 'Second', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    api.reorderBlocksInSpace.mockResolvedValue([]);
    renderPage();
    await screen.findByText('First');

    const rows = document.querySelectorAll('.block-row');
    expect(rows[0].getAttribute('draggable')).toBe('true');
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[1]);
    fireEvent.drop(rows[1]);

    await waitFor(() => expect(api.reorderBlocksInSpace).toHaveBeenCalledWith('space-1', ['b2', 'b1']));
  });

  it('does not offer dragging while a filter is hiding entries', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'First', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b3', type: 'text', content: { lines: [{ id: 'l3', text: 'Third', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'list', content: { laneLabel: 'L', items: [] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('First');
    // Dropping "here" would mean a position the screen isn't showing.
    await user.click(screen.getByText('Writing (2)'));
    await waitFor(() =>
      expect(document.querySelector('.block-row').getAttribute('draggable')).toBe('false')
    );
  });

  it('shows an unknown-type fallback for a Block type not in the registry', async () => {
    api.getBlocksForSpace.mockResolvedValue([{ id: 'b1', type: 'mystery-type', content: {}, properties: {}, updated_at: 'v1' }]);
    renderPage();
    expect(await screen.findByText('Unknown entry type: mystery-type')).toBeInTheDocument();
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
    const input = screen.getByPlaceholderText('+ New Workspace');
    await user.type(input, 'New Area');
    await user.click(within(input.closest('form')).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith('space-1', 'New Area'));
  });
});

describe('SpacePage: moving an entry to another Space', () => {
  const anEntry = [
    { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'a thought', tag: null }] }, properties: {}, updated_at: 'v1' },
  ];

  it('offers every other Space, and not this one', async () => {
    api.getBlocksForSpace.mockResolvedValue(anEntry);
    api.getSpaces.mockResolvedValue([
      { id: 'space-1', title: 'My Space' },
      { id: 'space-2', title: 'Somewhere Else' },
    ]);
    renderPage();
    await screen.findByText('My Space');
    const mover = await screen.findByLabelText('Move this entry to another Space');
    expect(within(mover).getByRole('option', { name: 'Somewhere Else' })).toBeInTheDocument();
    expect(within(mover).queryByRole('option', { name: 'My Space' })).not.toBeInTheDocument();
  });

  it('moves the entry when a destination is picked', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([
      { id: 'space-1', title: 'My Space' },
      { id: 'space-2', title: 'Somewhere Else' },
    ]);
    api.getBlocksForSpace.mockResolvedValue(anEntry);
    api.moveBlockToSpace.mockResolvedValue({});
    renderPage();
    await screen.findByText('My Space');
    await user.selectOptions(await screen.findByLabelText('Move this entry to another Space'), 'space-2');
    await waitFor(() => expect(api.moveBlockToSpace).toHaveBeenCalledWith('b1', 'space-2'));
  });

  it('does not offer to move a Skeleton section out of its Space', async () => {
    api.getSpaces.mockResolvedValue([
      { id: 'space-1', title: 'My Space' },
      { id: 'space-2', title: 'Somewhere Else' },
    ]);
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'list', content: { heading: 'Premises', items: [] }, properties: { skeletonLane: 'premises' }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('My Space');
    expect(screen.queryByLabelText('Move this entry to another Space')).not.toBeInTheDocument();
  });

  it('offers nothing when this is the only Space there is', async () => {
    api.getBlocksForSpace.mockResolvedValue(anEntry);
    api.getSpaces.mockResolvedValue([{ id: 'space-1', title: 'My Space' }]);
    renderPage();
    await screen.findByText('My Space');
    expect(screen.queryByLabelText('Move this entry to another Space')).not.toBeInTheDocument();
  });
});

describe('SpacePage: backlinks', () => {
  it('shows which Spaces reference this one', async () => {
    api.getBacklinksForSpace.mockResolvedValue([{ blockId: 'b1', sourceSpaceId: 'other', sourceSpaceTitle: 'Other Space', note: 'why it matters' }]);
    renderPage();
    const referencedBy = (await screen.findByText('Referenced by:')).closest('p');
    expect(within(referencedBy).getByRole('link', { name: 'Other Space' })).toHaveAttribute('href', '/spaces/other');
    // Scoped to this paragraph specifically -- the phrase "why it
    // matters" also appears verbatim in the Question Work Type's own
    // registry description, rendered elsewhere on this page by the
    // "+ Add Entry" form's Compare Work Types panel.
    expect(within(referencedBy).getByText(/why it matters/)).toBeInTheDocument();
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

describe('SpacePage: deep-link highlighting', () => {
  it('flashes only the entry named by ?highlight=', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Not this one', tag: null }] }, properties: {}, updated_at: 'v1' },
      { id: 'b2', type: 'text', content: { lines: [{ id: 'l2', text: 'The linked entry', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage('/spaces/space-1?highlight=b2');
    await screen.findByText('The linked entry');

    expect(document.getElementById('block-b2')).toHaveAttribute('data-highlighted', 'true');
    expect(document.getElementById('block-b1')).not.toHaveAttribute('data-highlighted');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it('clears the flash after its visible window, same expiry pattern Toast.jsx uses', async () => {
    vi.useFakeTimers();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b2', type: 'text', content: { lines: [{ id: 'l2', text: 'The linked entry', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage('/spaces/space-1?highlight=b2');
    // The initial data fetch is a resolved-promise chain, not a timer, so
    // it settles under fake timers too -- flushing microtasks (rather than
    // Testing Library's real-timer-polling findByText) is what actually
    // waits for it here.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.getElementById('block-b2')).toHaveAttribute('data-highlighted', 'true');

    act(() => vi.advanceTimersByTime(2500));
    expect(document.getElementById('block-b2')).not.toHaveAttribute('data-highlighted');
    vi.useRealTimers();
  });

  it('highlights nothing when the URL carries no ?highlight= param', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'text', content: { lines: [{ id: 'l1', text: 'Ordinary entry', tag: null }] }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Ordinary entry');
    expect(document.getElementById('block-b1')).not.toHaveAttribute('data-highlighted');
  });
});

describe('SpacePage: flash-on-create (see CLAUDE.md\'s cohesion-pass entry)', () => {
  it('flashes a newly added block\'s row, generalizing the same mechanism deep-linking uses', async () => {
    api.getBlocksForSpace
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'new-block-id', type: 'text', content: { lines: [{ id: 'l1', text: '', tag: null }] }, properties: {}, updated_at: 'v2' },
      ]);
    api.addBlockToSpace.mockResolvedValue({ id: 'new-block-id', changeSummary: 'Added a text entry to "Test Space"' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No entries yet.');
    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));

    await waitFor(() => expect(document.getElementById('block-new-block-id')).toHaveAttribute('data-highlighted', 'true'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('does not throw when addBlockToSpace resolves with nothing usable', async () => {
    api.addBlockToSpace.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No entries yet.');
    await expect(user.click(screen.getByRole('button', { name: '+ Add Entry' }))).resolves.not.toThrow();
  });
});
