import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Legend from './Legend.jsx';

function renderLegend(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <Legend onClose={onClose} />
    </MemoryRouter>
  );
}

describe('Legend', () => {
  it('renders as a labeled dialog', () => {
    renderLegend();
    expect(screen.getByRole('dialog', { name: 'How to read this app' })).toBeInTheDocument();
  });

  it('explains every computed dimension of the SpaceGlyph', () => {
    renderLegend();
    // Scoped to the legend's own explanatory <span>s, not getByText's
    // default whole-document search -- each demo glyph's own <title>
    // (see SpaceGlyph.jsx) also computes a description that can share a
    // word with the row explaining it (e.g. "overdue"), which would
    // otherwise trip a multiple-match error.
    const rowText = [...document.querySelectorAll('.legend-glyph-rows li > span')].map((el) => el.textContent).join(' | ');
    expect(rowText).toMatch(/dormant, inactive, active, interesting, mature/);
    expect(rowText).toMatch(/Branches are References/);
    expect(rowText).toMatch(/open Tensions/);
    expect(rowText).toMatch(/overdue/);
    expect(rowText).toMatch(/Milestones, filled in/);
    expect(rowText).toMatch(/The color is yours/);
  });

  it('renders the three family colors and links to the Tools catalog for the full icon glossary', () => {
    renderLegend();
    // getByText's substring matching (exact: false) would also match the
    // surrounding <li>'s own combined text ("Time -- due dates, ..."), so
    // this checks the <strong> labels directly rather than risking a
    // multiple-match error.
    const labels = [...document.querySelectorAll('.legend-family-rows strong')].map((el) => el.textContent);
    expect(labels).toEqual(['General', 'Work', 'Time']);
    expect(document.querySelectorAll('.legend-swatch')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Tools catalog' })).toHaveAttribute('href', '/tools');
  });

  it('calls onClose when clicking the overlay, the close button, or the catalog link', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderLegend(onClose);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel itself', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderLegend(onClose);
    await user.click(screen.getByText('How to read this app'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
