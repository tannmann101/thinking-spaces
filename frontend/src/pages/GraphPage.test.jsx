import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GraphPage from './GraphPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

// GraphPage renders the real GraphView, which runs a continuous
// requestAnimationFrame-driven physics loop -- see GraphView.test.jsx
// for why that's stubbed to a real macrotask rather than faked deeper.
vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <GraphPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GraphPage: loading and errors', () => {
  it('shows a loading state, then the checkbox list once fetched', async () => {
    api.getGraph.mockResolvedValue({ spaces: [{ id: 'a', title: 'Space A' }], workspaces: [], edges: [] });
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Space A')).toBeInTheDocument();
  });

  it('renders the graph canvas inside the wide breakout frame', async () => {
    api.getGraph.mockResolvedValue({ spaces: [{ id: 'a', title: 'Space A' }], workspaces: [], edges: [] });
    renderPage();
    await screen.findByText('Space A');
    const frame = document.querySelector('.graph-frame');
    expect(frame).toBeInTheDocument();
    expect(frame.querySelector('.graph-frame-inner svg.graph-svg')).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    api.getGraph.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Error: Nope')).toBeInTheDocument();
  });
});

describe('GraphPage: Relational Space creation', () => {
  it('disables Create until a name is entered and at least two Spaces are selected', async () => {
    const user = userEvent.setup();
    api.getGraph.mockResolvedValue({
      spaces: [{ id: 'a', title: 'Space A' }, { id: 'b', title: 'Space B' }],
      workspaces: [],
      edges: [],
    });
    renderPage();
    await screen.findByText('Space A');

    const button = screen.getByRole('button', { name: /Create Relational Space/ });
    expect(button).toBeDisabled();

    const [checkboxA] = screen.getAllByRole('checkbox');
    await user.click(checkboxA);
    expect(button).toBeDisabled();
    expect(screen.getByText('Select at least one more Space.')).toBeInTheDocument();

    const [, checkboxB] = screen.getAllByRole('checkbox');
    await user.click(checkboxB);
    expect(button).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'Combined');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Create Relational Space (2 selected)');
  });

  it('creates the Relational Space and navigates to it', async () => {
    const user = userEvent.setup();
    api.getGraph.mockResolvedValue({
      spaces: [{ id: 'a', title: 'Space A' }, { id: 'b', title: 'Space B' }],
      workspaces: [],
      edges: [],
    });
    api.createRelationalSpace.mockResolvedValue({ id: 'new-rel-id' });
    renderPage();
    await screen.findByText('Space A');

    const [checkboxA, checkboxB] = screen.getAllByRole('checkbox');
    await user.click(checkboxA);
    await user.click(checkboxB);
    await user.type(screen.getByRole('textbox'), 'Combined');
    await user.click(screen.getByRole('button', { name: /Create Relational Space/ }));

    await waitFor(() =>
      expect(api.createRelationalSpace).toHaveBeenCalledWith({ title: 'Combined', spaceIds: ['a', 'b'] })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-rel-id');
  });

  it('shows an error and re-enables the form when creation fails', async () => {
    const user = userEvent.setup();
    api.getGraph.mockResolvedValue({
      spaces: [{ id: 'a', title: 'Space A' }, { id: 'b', title: 'Space B' }],
      workspaces: [],
      edges: [],
    });
    api.createRelationalSpace.mockRejectedValue(new Error('Server exploded'));
    renderPage();
    await screen.findByText('Space A');

    const [checkboxA, checkboxB] = screen.getAllByRole('checkbox');
    await user.click(checkboxA);
    await user.click(checkboxB);
    await user.type(screen.getByRole('textbox'), 'Combined');
    await user.click(screen.getByRole('button', { name: /Create Relational Space/ }));

    expect(await screen.findByText('Error: Server exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Relational Space/ })).toBeEnabled();
  });
});
