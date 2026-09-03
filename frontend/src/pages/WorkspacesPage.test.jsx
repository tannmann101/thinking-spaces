import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorkspacesPage from './WorkspacesPage.jsx';
import { WORKSPACE_KIND_ORDER } from '../registry/workspaceKinds.js';
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
      <WorkspacesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getAllWorkspaces.mockResolvedValue([]);
  api.getSpaces.mockResolvedValue([{ id: 'space-1', title: 'My Space' }]);
  api.getNeedsAttentionCount?.mockResolvedValue?.({ count: 0 });
});

describe('WorkspacesPage: the catalog', () => {
  it('shows every registered kind, so the page can never drift from the registry', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('.kind-card')).toHaveLength(WORKSPACE_KIND_ORDER.length));
  });

  it('shows each kind sections and what it starts you with', async () => {
    renderPage();
    await screen.findByText('Etymology');
    const card = [...document.querySelectorAll('.kind-card')].find((c) => c.textContent.includes('Etymology'));
    expect(within(card).getByText('The word itself')).toBeInTheDocument();
    expect(card.textContent).toContain('Word Evolution');
  });

  it('carries each kind own theme on its card', async () => {
    renderPage();
    await screen.findByText('Analyst');
    const card = [...document.querySelectorAll('.kind-card')].find((c) => c.textContent.includes('Analyst'));
    expect(card.getAttribute('data-theme-accent')).toBe('maroon');
  });

  it('asks which Space to put a new Workspace in, since one belongs to exactly one Space', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Analyst');
    await user.click(screen.getByRole('button', { name: 'Start a Analyst Workspace' }));
    expect(screen.getByText(/In which Space\?/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'My Space' })).toBeInTheDocument();
  });

  it('creates the Workspace with its kind and starter blocks, then opens it', async () => {
    const user = userEvent.setup();
    api.createWorkspace.mockResolvedValue({ id: 'ws-new' });
    renderPage();
    await screen.findByText('Analyst');
    await user.click(screen.getByRole('button', { name: 'Start a Analyst Workspace' }));
    await user.selectOptions(screen.getByRole('combobox'), 'space-1');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalled());
    const [spaceId, name, kind, starterBlocks] = api.createWorkspace.mock.calls[0];
    expect(spaceId).toBe('space-1');
    expect(name).toBe('Analyst');
    expect(kind).toBe('analyst');
    expect(starterBlocks.length).toBeGreaterThan(0);
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/space-1/workspaces/ws-new');
  });
});

describe('WorkspacesPage: the directory', () => {
  it('says so plainly when there are no Workspaces yet', async () => {
    renderPage();
    expect(await screen.findByText(/None yet\./)).toBeInTheDocument();
  });

  it('lists every Workspace with its kind, Space and Tool count', async () => {
    api.getAllWorkspaces.mockResolvedValue([
      {
        id: 'ws-1',
        space_id: 'space-1',
        space_title: 'My Space',
        name: 'Etymology',
        kind: 'etymology',
        member_count: 3,
      },
    ]);
    renderPage();
    await waitFor(() => expect(document.querySelector('.workspace-directory-row')).toBeTruthy());
    const row = document.querySelector('.workspace-directory-row');
    expect(within(row).getByRole('link', { name: /Etymology/ })).toHaveAttribute(
      'href',
      '/spaces/space-1/workspaces/ws-1'
    );
    expect(row.textContent).toContain('Etymology');
    expect(row.textContent).toContain('My Space');
    expect(row.textContent).toContain('3 Tools');
  });

  it('reads an unkinded Workspace as Plain rather than blank', async () => {
    api.getAllWorkspaces.mockResolvedValue([
      { id: 'ws-2', space_id: 'space-1', space_title: 'My Space', name: 'Scratch', kind: null, member_count: 1 },
    ]);
    renderPage();
    await waitFor(() => expect(document.querySelector('.workspace-directory-row')).toBeTruthy());
    const row = document.querySelector('.workspace-directory-row');
    expect(row.textContent).toContain('Plain');
    // Singular, not "1 Tools".
    expect(row.textContent).toContain('1 Tool');
    expect(row.textContent).not.toContain('1 Tools');
  });

  it('shows an error rather than an empty page when the fetch fails', async () => {
    api.getAllWorkspaces.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Could not load Workspaces: Nope')).toBeInTheDocument();
  });
});
