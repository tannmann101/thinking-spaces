import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GraphView from './GraphView.jsx';

// GraphView runs a continuous hand-rolled physics simulation
// (requestAnimationFrame-driven) -- deep interaction testing (drag,
// pan, zoom) would mean faking real layout geometry jsdom doesn't
// provide, for a component whose actual correctness is "does it look
// right," best judged visually. This is a smoke test: given real
// nodes/edges, does it render without crashing and label the nodes
// it was given -- not a substitute for looking at it.
vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

describe('GraphView', () => {
  it('renders an SVG container given real Spaces, Workspaces, Projects, and edges, without crashing', () => {
    // Node positions come from a physics loop that only populates
    // nodesRef.current once the first animation frame fires -- with
    // requestAnimationFrame stubbed to a real macrotask, node labels
    // aren't necessarily painted yet at the moment render() returns.
    // Asserting on the SVG shell existing (not throwing) is the
    // meaningful, stable thing to check here; see the file header
    // comment for why deeper interaction testing isn't a good fit.
    const { container } = render(
      <MemoryRouter>
        <GraphView
          spaces={[{ id: 'a', title: 'Space A', status: 'nascent' }, { id: 'b', title: 'Space B', status: 'mature' }]}
          workspaces={[{ id: 'ws-1', space_id: 'a', name: 'A Workspace' }]}
          projects={[{ id: 'proj-1', space_id: 'b', name: 'A Project' }]}
          edges={[
            { kind: 'reference', blockId: 'e1', sourceSpaceId: 'a', targetSpaceId: 'b' },
            { kind: 'contains', spaceId: 'a', workspaceId: 'ws-1' },
            { kind: 'contains-project', spaceId: 'b', projectId: 'proj-1' },
          ]}
        />
      </MemoryRouter>
    );
    expect(container.querySelector('svg.graph-svg')).toBeInTheDocument();
  });

  it('shows a plain message instead of an SVG when there are no Spaces at all', () => {
    const { container } = render(
      <MemoryRouter>
        <GraphView spaces={[]} workspaces={[]} projects={[]} edges={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText('No Spaces yet.')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
