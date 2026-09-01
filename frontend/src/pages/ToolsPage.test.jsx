import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ToolsPage from './ToolsPage.jsx';
import { blockRegistry } from '../registry/blocks.js';
import { viewRegistry } from '../registry/views.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';

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

describe('ToolsPage: Skeleton & Tensions', () => {
  it('documents the Skeleton, even though it is not a registered Block or View', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Skeleton & Tensions', level: 2 })).toBeInTheDocument();
    for (const lane of SKELETON_LANE_LABELS) {
      expect(screen.getByText(lane.label)).toBeInTheDocument();
    }
    // "?" also appears as the Question Tool's own icon elsewhere on the
    // page, so check the shorthand symbols via their <code> elements
    // specifically rather than a page-wide text match.
    const codeTexts = [...document.querySelectorAll('code')].map((el) => el.textContent);
    expect(codeTexts).toEqual(['=', '?', '!']);
  });
});
