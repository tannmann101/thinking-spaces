import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from './ProjectsPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function project(overrides = {}) {
  return {
    id: 'pr-1',
    name: 'Ship the redesign',
    goal_id: null,
    goalName: null,
    spaces: [],
    milestoneCount: 0,
    reachedCount: 0,
    minutesLogged: 0,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getProjects.mockResolvedValue([]);
  api.getGoals.mockResolvedValue([]);
});

describe('ProjectsPage', () => {
  it('shows an empty state when nothing has been taken on yet', async () => {
    renderPage();
    expect(await screen.findByText(/None yet\./)).toBeInTheDocument();
  });

  it('shows an error when the index fails to load', async () => {
    api.getProjects.mockRejectedValue(new Error('Gone'));
    renderPage();
    expect(await screen.findByText('Could not load Projects: Gone')).toBeInTheDocument();
  });

  // The index earns its place on what a Space page could never show:
  // which Spaces a Project's work actually spans.
  it('names every Space a Project has work in', async () => {
    api.getProjects.mockResolvedValue([
      project({
        spaces: [
          { spaceId: 's1', spaceTitle: 'My Space' },
          { spaceId: 's2', spaceTitle: 'Another Space' },
        ],
      }),
    ]);
    renderPage();
    const card = (await screen.findByText('Ship the redesign')).closest('.project-card');
    expect(within(card).getByRole('link', { name: 'My Space' })).toHaveAttribute('href', '/spaces/s1');
    expect(within(card).getByRole('link', { name: 'Another Space' })).toHaveAttribute('href', '/spaces/s2');
  });

  it('says so plainly when a Project has no work assigned yet', async () => {
    api.getProjects.mockResolvedValue([project()]);
    renderPage();
    expect(await screen.findByText('Nothing assigned yet.')).toBeInTheDocument();
  });

  it('shows the Goal it serves and how far it has got', async () => {
    api.getProjects.mockResolvedValue([
      project({ goalName: 'Understand systems', milestoneCount: 3, reachedCount: 1, minutesLogged: 45 }),
    ]);
    renderPage();
    const card = (await screen.findByText('Ship the redesign')).closest('.project-card');
    expect(card.textContent).toContain('Serving: Understand systems');
    expect(card.textContent).toContain('1 of 3 reached');
    expect(card.textContent).toContain('45 min logged');
  });

  it('links each Project to its own page', async () => {
    api.getProjects.mockResolvedValue([project()]);
    renderPage();
    expect(await screen.findByRole('link', { name: 'Ship the redesign' })).toHaveAttribute('href', '/projects/pr-1');
  });

  it('creates a Project, optionally naming the Goal it serves', async () => {
    const user = userEvent.setup();
    api.getGoals.mockResolvedValue([{ id: 'goal-1', name: 'Understand systems', spaces: [], projects: [] }]);
    api.createProject.mockResolvedValue(project());
    renderPage();
    await screen.findByText(/None yet\./);
    await user.type(screen.getByPlaceholderText('New Project name'), 'Read the book');
    await user.selectOptions(screen.getByRole('combobox'), 'goal-1');
    await user.click(screen.getByRole('button', { name: '+ New Project' }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('Read the book', 'goal-1'));
  });

  it('creates a Project with no Goal at all', async () => {
    const user = userEvent.setup();
    api.createProject.mockResolvedValue(project());
    renderPage();
    await screen.findByText(/None yet\./);
    await user.type(screen.getByPlaceholderText('New Project name'), 'Read the book');
    await user.click(screen.getByRole('button', { name: '+ New Project' }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('Read the book', null));
  });

  // A Goal is optional here, so failing to load the list must not take
  // the page down with it.
  it('still lets a Project be created when the Goals list fails to load', async () => {
    api.getGoals.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findByText(/None yet\./);
    expect(screen.getByPlaceholderText('New Project name')).toBeInTheDocument();
  });
});
