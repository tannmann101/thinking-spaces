import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateSpace from './CreateSpace.jsx';
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
      <CreateSpace />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getTemplates.mockResolvedValue([]);
  api.getSpacesByTag.mockResolvedValue([]);
});

describe('CreateSpace: starting cluster', () => {
  it('shows a loading state, then Start Blank plus every Template as cards', async () => {
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'Inquiry / Analytical', block_arrangement: [{ type: 'text' }, { type: 'list' }] }]);
    renderPage();
    expect(screen.getByText('Loading templates...')).toBeInTheDocument();
    expect(await screen.findByText('Start Blank')).toBeInTheDocument();
    expect(screen.getByText('Inquiry / Analytical')).toBeInTheDocument();
    expect(screen.getByText('2 starting Tools')).toBeInTheDocument();
  });

  it('starts with Start Blank selected, and shows no cluster preview', async () => {
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'A Template', block_arrangement: [] }]);
    renderPage();
    await screen.findByText('Start Blank');
    expect(screen.getByText('Start Blank').closest('button')).toHaveClass('selected');
    expect(screen.queryByText(/What ".*" starts with/)).not.toBeInTheDocument();
  });

  it('selecting a Template shows its preview and marks it selected', async () => {
    const user = userEvent.setup();
    api.getTemplates.mockResolvedValue([{ id: 't1', name: 'A Template', block_arrangement: [{ type: 'text', content: { text: 'hi' } }] }]);
    renderPage();
    await user.click(await screen.findByText('A Template'));
    expect(screen.getByText('A Template').closest('button')).toHaveClass('selected');
    expect(screen.getByText('What "A Template" starts with:')).toBeInTheDocument();
  });
});

describe('CreateSpace: Workspaces step', () => {
  it('adds a draft Workspace name as a chip, and removes it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Start Blank');

    await user.type(screen.getByPlaceholderText('+ Workspace name'), 'Focus Area');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    // "Focus Area" now appears twice -- the chip itself, and as a
    // toggle option in the Tools step's NewBlockForm below it.
    expect(screen.getAllByText('Focus Area').length).toBeGreaterThan(0);
    expect(document.querySelector('.workspace-name-row')).toBeInTheDocument();

    await user.click(screen.getByTitle('Remove'));
    expect(document.querySelector('.workspace-name-row')).not.toBeInTheDocument();
  });

  it('does not add a blank or duplicate Workspace name', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Start Blank');
    const input = screen.getByPlaceholderText('+ Workspace name');

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.queryByTitle('Remove')).not.toBeInTheDocument();

    await user.type(input, 'Focus{Enter}');
    await user.type(input, 'Focus{Enter}');
    // Exactly one chip in the Workspaces step itself, regardless of how
    // many times "Focus" was submitted -- NewBlockForm's own toggle
    // list below also shows "Focus" once, which is a second, expected
    // occurrence of the same text elsewhere on the page.
    expect(document.querySelectorAll('.workspace-name-row .workspace-chip')).toHaveLength(1);
  });
});

describe('CreateSpace: Tools step', () => {
  it('adding a block via NewBlockForm shows it in the preview list, removable', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Start Blank');

    await user.click(screen.getByRole('button', { name: '+ Add Entry' }));
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});

describe('CreateSpace: Resources step', () => {
  it('shows an empty-state message when there are no Resources yet', async () => {
    renderPage();
    expect(await screen.findByText('No Resources yet -- tag a Space "resource" to have it show up here.')).toBeInTheDocument();
  });

  it('lists existing Resources as checkboxes and tracks selection', async () => {
    const user = userEvent.setup();
    api.getSpacesByTag.mockResolvedValue([{ id: 'r1', title: 'A Resource' }]);
    renderPage();
    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});

describe('CreateSpace: tags and goal', () => {
  it('adds a tag on Enter and removes it on click', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Start Blank');
    await user.type(screen.getByPlaceholderText('+ tag'), 'resource{Enter}');
    expect(screen.getByText('resource')).toBeInTheDocument();

    await user.click(screen.getByTitle('Remove tag'));
    expect(screen.queryByText('resource')).not.toBeInTheDocument();
  });
});

describe('CreateSpace: submitting', () => {
  it('disables Create Space until a title is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Start Blank');
    expect(screen.getByRole('button', { name: 'Create Space' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What is this Space about?'), 'My Space');
    expect(screen.getByRole('button', { name: 'Create Space' })).toBeEnabled();
  });

  it('submits with the composed payload and navigates to the new Space', async () => {
    const user = userEvent.setup();
    api.createSpace.mockResolvedValue({ id: 'new-space-id' });
    renderPage();
    await screen.findByText('Start Blank');

    await user.type(screen.getByPlaceholderText('What is this Space about?'), 'My New Space');
    await user.type(screen.getByPlaceholderText('(optional)'), 'Ship it');
    await user.type(screen.getByPlaceholderText('+ tag'), 'resource{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create Space' }));

    await waitFor(() =>
      expect(api.createSpace).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My New Space', goal: 'Ship it', tags: ['resource'], templateId: null })
      )
    );
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-space-id');
  });

  it('shows an error and re-enables the form when creation fails', async () => {
    const user = userEvent.setup();
    api.createSpace.mockRejectedValue(new Error('Server exploded'));
    renderPage();
    await screen.findByText('Start Blank');
    await user.type(screen.getByPlaceholderText('What is this Space about?'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create Space' }));

    expect(await screen.findByText('Could not create Space: Server exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Space' })).toBeEnabled();
  });
});
