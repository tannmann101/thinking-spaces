import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateSynthesis from './CreateSynthesis.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateSynthesis />
    </MemoryRouter>
  );
}

function workItem(overrides = {}) {
  return { id: 'w1', type: 'assessment', space_id: 'space-1', space_title: 'Source Space', content: { statement: 'A claim' }, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getWorkItems.mockResolvedValue([]);
});

describe('CreateSynthesis: kind', () => {
  it('toggles a kind suggestion on and off', async () => {
    const user = userEvent.setup();
    renderPage();
    const essayButton = screen.getByRole('button', { name: 'essay' });
    await user.click(essayButton);
    expect(essayButton).toHaveClass('category-chip-active');
    await user.click(essayButton);
    expect(essayButton).not.toHaveClass('category-chip-active');
  });

  it('selecting a different kind deselects the previous one (single choice)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'essay' }));
    await user.click(screen.getByRole('button', { name: 'story' }));
    expect(screen.getByRole('button', { name: 'essay' })).not.toHaveClass('category-chip-active');
    expect(screen.getByRole('button', { name: 'story' })).toHaveClass('category-chip-active');
  });
});

describe('CreateSynthesis: source material picker', () => {
  it('shows an empty-state message when there are no Work items yet', async () => {
    renderPage();
    expect(await screen.findByText('No Work items exist yet -- create an Assessment, Question, or another Work Type in a Space first.')).toBeInTheDocument();
  });

  it('groups Work items by their source Space', async () => {
    api.getWorkItems.mockResolvedValue([
      workItem({ id: 'a', space_title: 'Space A', content: { statement: 'Claim A' } }),
      workItem({ id: 'b', space_title: 'Space B', content: { statement: 'Claim B' } }),
    ]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Space A', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Space B', level: 4 })).toBeInTheDocument();
  });

  it('shows a selected count, and filtering by search does not lose an existing selection', async () => {
    const user = userEvent.setup();
    api.getWorkItems.mockResolvedValue([
      workItem({ id: 'a', content: { statement: 'Keep this one' } }),
      workItem({ id: 'b', content: { statement: 'Something else entirely' } }),
    ]);
    renderPage();
    await screen.findByText('Keep this one');

    const [checkboxA] = screen.getAllByRole('checkbox');
    await user.click(checkboxA);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search by statement...'), 'Something else');
    expect(screen.queryByText('Keep this one')).not.toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Search by statement...'));
    expect(screen.getByRole('checkbox', { name: /Keep this one/ })).toBeChecked();
  });

  it('shows a "no matches" message when the search matches nothing', async () => {
    const user = userEvent.setup();
    api.getWorkItems.mockResolvedValue([workItem({ content: { statement: 'Alpha' } })]);
    renderPage();
    await screen.findByText('Alpha');
    await user.type(screen.getByPlaceholderText('Search by statement...'), 'zzz');
    expect(await screen.findByText('No Work items match “zzz”.')).toBeInTheDocument();
  });
});

describe('CreateSynthesis: submitting', () => {
  it('disables submit until a title is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('button', { name: 'Create Synthesis' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What is this piece called?'), 'My Piece');
    expect(screen.getByRole('button', { name: 'Create Synthesis' })).toBeEnabled();
  });

  it('composes a Reference per source Space and a Source Material block copying selected statements, tagged synthesis + kind, origin internal', async () => {
    const user = userEvent.setup();
    api.getWorkItems.mockResolvedValue([workItem({ id: 'a', type: 'assessment', space_id: 'src-space', content: { statement: 'The key claim' } })]);
    api.createSpace.mockResolvedValue({ id: 'new-synthesis-id' });
    renderPage();

    await user.type(screen.getByPlaceholderText('What is this piece called?'), 'My Essay');
    await user.click(screen.getByRole('button', { name: 'essay' }));
    await screen.findByText('The key claim');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create Synthesis' }));

    await waitFor(() => expect(api.createSpace).toHaveBeenCalled());
    const payload = api.createSpace.mock.calls[0][0];
    expect(payload.title).toBe('My Essay');
    expect(payload.tags).toEqual(['synthesis', 'essay']);
    expect(payload.origin).toBe('internal');
    expect(payload.extraBlocks[0]).toMatchObject({ type: 'reference', content: { target_space_id: 'src-space' } });
    expect(payload.extraBlocks[1].content.text).toContain('The key claim');
    expect(payload.extraBlocks[1].content.text).toContain('Assessment');
    // Always ends with one blank Text block to actually write the piece in.
    expect(payload.extraBlocks[payload.extraBlocks.length - 1]).toMatchObject({ type: 'text', content: { text: '' } });
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-synthesis-id');
  });

  it('submits with no source material at all when nothing is selected', async () => {
    const user = userEvent.setup();
    api.createSpace.mockResolvedValue({ id: 'blank-id' });
    renderPage();
    await user.type(screen.getByPlaceholderText('What is this piece called?'), 'Blank Draft');
    await user.click(screen.getByRole('button', { name: 'Create Synthesis' }));

    await waitFor(() => expect(api.createSpace).toHaveBeenCalled());
    const payload = api.createSpace.mock.calls[0][0];
    // Just the one blank Text block, no references, no source-material block.
    expect(payload.extraBlocks).toEqual([{ type: 'text', content: { tag: null, text: '' }, properties: {} }]);
    expect(payload.tags).toEqual(['synthesis']);
  });

  it('shows an error and re-enables the form when creation fails', async () => {
    const user = userEvent.setup();
    api.createSpace.mockRejectedValue(new Error('Nope'));
    renderPage();
    await user.type(screen.getByPlaceholderText('What is this piece called?'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create Synthesis' }));

    expect(await screen.findByText('Could not create Synthesis: Nope')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Synthesis' })).toBeEnabled();
  });
});
