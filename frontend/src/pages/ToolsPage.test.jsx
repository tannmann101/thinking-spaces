import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// api.js is deliberately never mocked in this file (see the comment at
// the top) -- these tests lean on that: if a demo ever reached for the
// real API instead of DemoBlock's own local state, the unmocked fetch()
// call would blow up jsdom and fail the test loudly, rather than the
// test having to assert a spy was never called.
describe('ToolsPage: interactive demos', () => {
  it('toggles a List demo\'s checkbox without persisting anything', async () => {
    const user = userEvent.setup();
    renderPage();
    const listCard = screen.getByRole('heading', { name: 'List', level: 4 }).closest('.tool-card');
    const [checkbox] = within(listCard).getAllByRole('checkbox');
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('opens a Text demo for editing on click', async () => {
    const user = userEvent.setup();
    renderPage();
    const textCard = screen.getByRole('heading', { name: 'Text', level: 4 }).closest('.tool-card');
    await user.click(within(textCard).getByText(/A demo paragraph/));
    expect(within(textCard).getByRole('textbox')).toBeInTheDocument();
  });

  it('never mutates the registry\'s own shared demo data across renders', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    const firstListCard = screen.getByRole('heading', { name: 'List', level: 4 }).closest('.tool-card');
    const [firstCheckbox] = within(firstListCard).getAllByRole('checkbox');
    await user.click(firstCheckbox);
    expect(firstCheckbox).not.toBeChecked();
    unmount();

    renderPage();
    const secondListCard = screen.getByRole('heading', { name: 'List', level: 4 }).closest('.tool-card');
    const [secondCheckbox] = within(secondListCard).getAllByRole('checkbox');
    expect(secondCheckbox).toBeChecked();
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
