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

function milestone(overrides = {}) {
  return {
    id: 'b1',
    space_id: 'space-1',
    spaceTitle: 'My Space',
    type: 'milestone',
    content: { label: 'Ship it', targetDate: null, reached: false, reachedAt: null, note: '' },
    properties: { projectId: 'pr-1' },
    updated_at: 'v1',
    ...overrides,
  };
}

function renderPage(path = '/projects/pr-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </ConfirmDialogProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getProject.mockResolvedValue({ id: 'pr-1', name: 'Ship the redesign', goal_id: null });
  api.getProjectBlocks.mockResolvedValue([]);
  api.getSpaces.mockResolvedValue([{ id: 'space-1', title: 'My Space' }]);
  api.getGoals.mockResolvedValue([]);
  api.getBlocksForSpace.mockResolvedValue([]);
});

describe('ProjectPage: loading and errors', () => {
  it('shows a loading state, then the Project once fetched', async () => {
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Ship the redesign')).toBeInTheDocument();
  });

  it('shows an error when the Project fails to load', async () => {
    api.getProject.mockRejectedValue(new Error('Gone'));
    renderPage();
    expect(await screen.findByText('Could not load Project: Gone')).toBeInTheDocument();
  });

  // A Project belongs to no Space, so the way back is the index, not
  // a parent Space it no longer has.
  it('links back to the Projects index', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /All Projects/ });
    expect(link).toHaveAttribute('href', '/projects');
  });
});

describe('ProjectPage: renaming', () => {
  it('renames the Project on blur', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ship the redesign'));
    const input = screen.getByDisplayValue('Ship the redesign');
    await user.clear(input);
    await user.type(input, 'Renamed project');
    await user.tab();
    await waitFor(() => expect(api.renameProject).toHaveBeenCalledWith('pr-1', 'Renamed project'));
  });
});

describe('ProjectPage: the Goal it serves', () => {
  it('shows the Goals available and sets the one this Project serves', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([{ id: 'goal-1', name: 'Understand systems', spaces: [], projects: [] }]);
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('Serving:'), 'goal-1');
    await waitFor(() => expect(api.setProjectGoal).toHaveBeenCalledWith('pr-1', 'goal-1'));
  });

  it('detaches from a Goal when set back to none', async () => {
    const user = userEvent.setup();
    api.getProject.mockResolvedValue({ id: 'pr-1', name: 'Ship the redesign', goal_id: 'goal-1' });
    api.getGoals.mockResolvedValue([{ id: 'goal-1', name: 'Understand systems', spaces: [], projects: [] }]);
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('Serving:'), '');
    await waitFor(() => expect(api.setProjectGoal).toHaveBeenCalledWith('pr-1', null));
  });
});

describe('ProjectPage: progress summary', () => {
  it('shows nothing when the Project has no Milestones or Sessions yet', async () => {
    renderPage();
    await screen.findByText('Ship the redesign');
    expect(screen.queryByText(/reached/)).not.toBeInTheDocument();
  });

  it('summarizes reached Milestones and minutes logged across Sessions', async () => {
    api.getProjectBlocks.mockResolvedValue([
      milestone({ id: 'b1', content: { label: 'A', reached: true } }),
      milestone({ id: 'b2', content: { label: 'B', reached: false } }),
      milestone({
        id: 'b3',
        type: 'session',
        content: { label: 'S', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:45:00Z', durationMinutes: 45 },
      }),
    ]);
    renderPage();
    await screen.findByText('Ship the redesign');
    const summary = document.querySelectorAll('.workspace-subtitle');
    const text = [...summary].map((n) => n.textContent).join(' ');
    expect(text).toContain('1 of 2 Milestones reached');
    expect(text).toContain('45 min logged across 1 Session');
  });
});

// The whole point of the inversion: one Project can hold work happening
// in several Spaces, and the page says where each entry actually is.
describe('ProjectPage: work across Spaces', () => {
  it('groups its entries under the Space each one lives in', async () => {
    api.getProjectBlocks.mockResolvedValue([
      milestone({ id: 'b1', space_id: 'space-1', spaceTitle: 'My Space' }),
      milestone({ id: 'b2', space_id: 'space-2', spaceTitle: 'Another Space' }),
    ]);
    renderPage();
    await screen.findByText('Ship the redesign');
    const headings = [...document.querySelectorAll('.project-space-heading')].map((n) => n.textContent);
    expect(headings).toEqual(['My Space', 'Another Space']);
  });

  it('links each Space heading to that Space', async () => {
    api.getProjectBlocks.mockResolvedValue([milestone()]);
    renderPage();
    await screen.findByText('Ship the redesign');
    const heading = document.querySelector('.project-space-heading');
    expect(within(heading).getByRole('link', { name: 'My Space' })).toHaveAttribute('href', '/spaces/space-1');
  });

  it('shows an empty-state message when nothing is assigned yet', async () => {
    renderPage();
    expect(await screen.findByText(/Nothing assigned to this Project yet/)).toBeInTheDocument();
  });

  it('removes an entry from the Project without deleting it', async () => {
    const user = userEvent.setup();
    api.getProjectBlocks.mockResolvedValue([milestone()]);
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.click(screen.getByRole('button', { name: 'Remove from Project' }));
    await waitFor(() => expect(api.updateBlockProject).toHaveBeenCalledWith('b1', null));
    expect(api.deleteBlockApi).not.toHaveBeenCalled();
  });

  it('deletes a member entry entirely after confirming', async () => {
    const user = userEvent.setup();
    api.getProjectBlocks.mockResolvedValue([milestone()]);
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    const dialog = screen.getByText('Remove this entry entirely? This cannot be undone.').closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteBlockApi).toHaveBeenCalledWith('b1'));
  });
});

describe('ProjectPage: adding work', () => {
  it('cannot add anything until a Space is picked, since a Project has none of its own', async () => {
    renderPage();
    await screen.findByText('Ship the redesign');
    expect(screen.getByRole('button', { name: '+ New Milestone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Start a Session/ })).toBeDisabled();
  });

  it('adds a new Milestone into the chosen Space, already assigned to this Project', async () => {
    const user = userEvent.setup();
    api.addBlockToSpace.mockResolvedValue({ id: 'new-1' });
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('In Space:'), 'space-1');
    await user.click(screen.getByRole('button', { name: '+ New Milestone' }));
    await waitFor(() =>
      expect(api.addBlockToSpace).toHaveBeenCalledWith(
        'space-1',
        expect.objectContaining({ type: 'milestone', properties: { projectId: 'pr-1' } })
      )
    );
  });

  it('starts a Session in the chosen Space, already assigned to this Project', async () => {
    const user = userEvent.setup();
    api.addBlockToSpace.mockResolvedValue({ id: 'new-2' });
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('In Space:'), 'space-1');
    await user.click(screen.getByRole('button', { name: /Start a Session/ }));
    await waitFor(() =>
      expect(api.addBlockToSpace).toHaveBeenCalledWith(
        'space-1',
        expect.objectContaining({
          type: 'session',
          properties: { projectId: 'pr-1' },
          content: expect.objectContaining({ startedAt: expect.any(String) }),
        })
      )
    );
  });

  it("flashes a newly added Milestone's row, same mechanism as SpacePage.jsx", async () => {
    const user = userEvent.setup();
    api.addBlockToSpace.mockResolvedValue({ id: 'new-1' });
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('In Space:'), 'space-1');
    api.getProjectBlocks.mockResolvedValue([milestone({ id: 'new-1' })]);
    await user.click(screen.getByRole('button', { name: '+ New Milestone' }));
    await waitFor(() =>
      expect(document.querySelector('#block-new-1')).toHaveAttribute('data-highlighted', 'true')
    );
  });

  it('offers what is already on the chosen Space to pull in, and assigns it', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'loose', space_id: 'space-1', type: 'milestone', content: { label: 'Unassigned' }, properties: {}, updated_at: 'v1' },
    ]);
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.selectOptions(screen.getByLabelText('In Space:'), 'space-1');
    await user.click(await screen.findByRole('button', { name: '+ Pull in' }));
    await waitFor(() => expect(api.updateBlockProject).toHaveBeenCalledWith('loose', 'pr-1'));
  });

  it('hides the pull-in section while no Space is picked', async () => {
    renderPage();
    await screen.findByText('Ship the redesign');
    expect(screen.queryByRole('button', { name: '+ Pull in' })).not.toBeInTheDocument();
  });
});

describe('ProjectPage: deleting the Project', () => {
  it('deletes after confirming, and navigates back to the Projects index', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.click(screen.getByRole('button', { name: 'Delete this Project' }));
    const dialog = screen
      .getByText('Delete the Project "Ship the redesign"? Its Milestones and Sessions stay on their Spaces.')
      .closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith('pr-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/projects');
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.click(screen.getByRole('button', { name: 'Delete this Project' }));
    const dialog = screen
      .getByText('Delete the Project "Ship the redesign"? Its Milestones and Sessions stay on their Spaces.')
      .closest('.confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(api.deleteProject).not.toHaveBeenCalled());
  });
});

describe('ProjectPage: Project Report', () => {
  it('fetches and shows the Project report narrative once opened', async () => {
    const user = userEvent.setup();
    api.getProjectReport.mockResolvedValue({ report: { sections: [] }, narrative: 'Ship the redesign (project)' });
    renderPage();
    await screen.findByText('Ship the redesign');
    await user.click(screen.getByRole('button', { name: 'Project Report' }));
    expect(await screen.findByText(/Ship the redesign \(project\)/)).toBeInTheDocument();
  });
});
