import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ToolsPage from './ToolsPage.jsx';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';

// ToolsPage is purely a read of blockRegistry/viewRegistry -- no API
// calls, nothing to mock. The one thing worth stubbing is the Graph
// View's demo, which runs the same continuous physics loop GraphView's
// own tests already establish is best left to a smoke check.
vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToolsPage />
    </MemoryRouter>
  );
}

describe('ToolsPage', () => {
  it('renders every registered Block and View as its own Tool card', () => {
    renderPage();
    for (const entry of Object.values(blockRegistry)) {
      expect(screen.getByRole('heading', { name: entry.label, level: 4 })).toBeInTheDocument();
    }
    for (const entry of Object.values(viewRegistry)) {
      expect(screen.getByRole('heading', { name: entry.label, level: 4 })).toBeInTheDocument();
    }
  });

  it('groups Block cards under General/Work/Time sub-headings', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'General', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Work', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Time', level: 3 })).toBeInTheDocument();
  });

  it('shows a "works with" line for a Tool that declares one', () => {
    renderPage();
    const entryWithWorksWith = Object.values(blockRegistry).find((e) => e.worksWith?.length > 0);
    expect(entryWithWorksWith).toBeTruthy();
    const expectedLabels = entryWithWorksWith.worksWith
      .map((k) => blockRegistry[k]?.label || viewRegistry[k]?.label || k)
      .join(', ');
    expect(screen.getByText(`Works with: ${expectedLabels}`)).toBeInTheDocument();
  });
});
