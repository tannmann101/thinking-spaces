import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectPage from './ProjectPage.jsx';
import { ConfirmDialogProvider } from '../components/ConfirmDialog.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

// jsdom doesn't implement scrollIntoView at all -- only the flash-on-add
// tests below actually check it, but the flash effect calls it
// unconditionally whenever a block is added, same reasoning
// SpacePage.test.jsx already stubs this for.
Element.prototype.scrollIntoView = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(path = '/spaces/space-1/projects/pr-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/spaces/:spaceId/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpace.mockResolvedValue({ id: 'space-1', title: 'My Space', categories: [] });
  api.getProject.mockResolvedValue({ id: 'pr-1', name: 'Ship the redesign' });
  api.getBlocksForSpace.mockResolvedValue([]);
});

describe('ProjectPage: loading and errors', () => {
  it('shows a loading state, then the Project once fetched', async () => {
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Ship the redesign')).toBeInTheDocument();
    expect(screen.getByText('A Project inside “My Space”')).toBeInTheDocument();
  });

  it('shows an error when the Project fails to load', async () => {
    api.getProject.mockRejectedValue(new Error('Gone'));
    renderPage();
    expect(await screen.findByText('Could not load Project: Gone')).toBeInTheDocument();
  });

  it('links back to the parent Space', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /Back to My Space/ });
    expect(link).toHaveAttribute('href', '/spaces/space-1');
  });
});

describe('ProjectPage: renaming', () => {
  it('renames the Project on blur', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ship the redesign'));
    const input = screen.getByDisplayValue('Ship the redesign');
    await user.clear(input);
    await user.type(input, 'Renamed goal');
    await user.tab();
    await waitFor(() => expect(api.renameProject).toHaveBeenCalledWith('pr-1', 'Renamed goal'));
  });
});

describe('ProjectPage: progress summary', () => {
  it('shows nothing when the Project has no Milestones or Sessions yet', async () => {
    renderPage();
    await screen.findByText('Ship the redesign');
    expect(screen.queryByText(/reached/)).not.toBeInTheDocument();
    expect(screen.queryByText(/min logged/)).not.toBeInTheDocument();
  });

  it('summarizes reached Milestones and minutes logged across Sessions', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'm1', type: 'milestone', content: { label: 'A', targetDate: null, reached: true, reachedAt: '2024-01-01', note: '' }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
      { id: 'm2', type: 'milestone', content: { label: 'B', targetDate: null, reached: false, reachedAt: null, note: '' }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
      { id: 's1', type: 'session', content: { label: 'Drafting', startedAt: '2024-01-01T00:00:00.000Z', endedAt: '2024-01-01T00:30:00.000Z', durationMinutes: 30, note: '' }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
    ]);
    renderPage();
    expect(await screen.findByText(/1 of 2 Milestones reached/)).toBeInTheDocument();
    expect(screen.getByText(/30 min logged across 1 Session/)).toBeInTheDocument();
  });
});

describe('ProjectPage: Project Report', () => {
  it('fetches and shows the Project report narrative once opened', async () => {
    const user = userEvent.setup();
    api.getProjectReport.mockResolvedValue({
      report: { level: 'project', id: 'pr-1', label: 'Ship the redesign', sections: [] },
      narrative: 'Project: Ship the redesign\n1 of 2 Milestones reached.',
    });
    renderPage();
    await screen.findByText('Ship the redesign');

    await user.click(screen.getByRole('button', { name: 'Project Report' }));
    expect(await screen.findByText(/1 of 2 Milestones reached/)).toBeInTheDocument();
    expect(api.getProjectReport).toHaveBeenCalledWith('pr-1');
  });
});

describe('ProjectPage: assembled Milestones/Sessions', () => {
  it('shows an empty-state message when nothing is assigned yet', async () => {
    renderPage();
    expect(
      await screen.findByText('Nothing assigned to this Project yet -- add a Milestone or Session below, or pull one in already on the Space.')
    ).toBeInTheDocument();
  });

  it('renders assigned Milestones/Sessions, and lets one be removed from the Project', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'milestone', content: { label: 'In this Project', targetDate: null, reached: false, reachedAt: null, note: '' }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('In this Project');

    await user.click(screen.getByRole('button', { name: 'Remove from Project' }));
    await waitFor(() => expect(api.updateBlockProject).toHaveBeenCalledWith('b1', null));
  });

  it('deletes a member entry entirely after confirming', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'milestone', content: { label: 'Doomed', targetDate: null, reached: false, reachedAt: null, note: '' }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Doomed');

    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    const dialog = screen.getByText('Remove this entry entirely? This cannot be undone.').closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteBlockApi).toHaveBeenCalledWith('b1'));
  });

  it('only shows Milestone/Session blocks, not other types filed elsewhere', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 't1', type: 'text', content: { lines: [] }, properties: { projectId: 'pr-1' }, updated_at: 'v1' },
    ]);
    renderPage();
    expect(
      await screen.findByText('Nothing assigned to this Project yet -- add a Milestone or Session below, or pull one in already on the Space.')
    ).toBeInTheDocument();
  });
});

describe('ProjectPage: adding and pulling in', () => {
  it('adding a new Milestone assigns it to this Project', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Add to this Project');
    await user.click(screen.getByRole('button', { name: '+ New Milestone' }));
    await waitFor(() =>
      expect(api.addBlockToSpace).toHaveBeenCalledWith(
        'space-1',
        expect.objectContaining({ type: 'milestone', properties: { projectId: 'pr-1' } })
      )
    );
  });

  it('flashes a newly added Milestone\'s row, same mechanism as SpacePage.jsx', async () => {
    api.getBlocksForSpace
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'new-id',
          type: 'milestone',
          content: { label: '', targetDate: null, reached: false, reachedAt: null, note: '' },
          properties: { projectId: 'pr-1' },
          updated_at: 'v2',
        },
      ]);
    api.addBlockToSpace.mockResolvedValue({ id: 'new-id', changeSummary: 'Added a milestone entry to "My Space"' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Add to this Project');
    await user.click(screen.getByRole('button', { name: '+ New Milestone' }));

    await waitFor(() => expect(document.getElementById('block-new-id')).toHaveAttribute('data-highlighted', 'true'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('starting a Session assigns it to this Project', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Add to this Project');
    await user.click(screen.getByRole('button', { name: /Start a Session/ }));
    await waitFor(() =>
      expect(api.addBlockToSpace).toHaveBeenCalledWith(
        'space-1',
        expect.objectContaining({ type: 'session', properties: { projectId: 'pr-1' } })
      )
    );
  });

  it('shows non-member Milestones/Sessions to pull in, and pulling one in assigns this Project to it', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'b1', type: 'milestone', content: { label: 'Elsewhere', targetDate: null, reached: false, reachedAt: null, note: '' }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Pull in a Milestone or Session already on this Space');
    // BlockPreview has no bespoke Milestone rendering, so it falls back
    // to its generic "[type] (not editable...)" preview -- same as any
    // other Block type it doesn't specifically know how to summarize.
    expect(screen.getByText(/\[milestone\]/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Pull in' }));
    await waitFor(() => expect(api.updateBlockProject).toHaveBeenCalledWith('b1', 'pr-1'));
  });

  it('hides the "pull in" section when there is nothing eligible to pull in', async () => {
    renderPage();
    await screen.findByText('Add to this Project');
    expect(screen.queryByText('Pull in a Milestone or Session already on this Space')).not.toBeInTheDocument();
  });
});

describe('ProjectPage: deleting the Project', () => {
  it('deletes the Project after confirming, and navigates back to the Space', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete this Project' }));
    const dialog = screen
      .getByText('Delete the Project "Ship the redesign"? Its Milestones and Sessions stay on the Space.')
      .closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith('pr-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/space-1');
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete this Project' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteProject).not.toHaveBeenCalled();
  });
});
