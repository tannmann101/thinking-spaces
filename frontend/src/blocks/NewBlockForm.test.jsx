import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewBlockForm from './NewBlockForm.jsx';
import { blockRegistry } from '../registry/blocks.js';

// Scoped to the "Compare Work Types" panel added once a native <select>
// was found unable to show more than one Work Type's description at a
// time -- comparing close calls like Insight vs. Implication meant
// reselecting through all 11 in turn. The rest of NewBlockForm's own
// behavior (submitting each entry shape) is already covered indirectly
// through SpacePage/WorkspacePage/CreateSpace/TemplateEditor's own
// tests, which all embed this form.
describe('NewBlockForm: Compare Work Types panel', () => {
  it('lists every Work Type\'s label and description, collapsed by default', () => {
    render(<NewBlockForm onAdd={vi.fn()} />);
    const details = screen.getByText('Compare Work Types').closest('details');
    expect(details).not.toHaveAttribute('open');

    // blockRegistry is the one source of truth for this list -- a
    // future Work Type should show up here with no edit to this file,
    // so assert against the registry itself rather than a hardcoded count.
    const workTypes = Object.values(blockRegistry).filter((entry) => entry.family === 'work');
    expect(workTypes.length).toBeGreaterThan(0);
    workTypes.forEach((entry) => {
      expect(screen.getByRole('button', { name: entry.label })).toBeInTheDocument();
      expect(screen.getByText(entry.description)).toBeInTheDocument();
    });
  });

  it('selects a Work Type in the dropdown when its label is clicked in the panel', async () => {
    const user = userEvent.setup();
    render(<NewBlockForm onAdd={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Implication' }));
    expect(screen.getByRole('combobox')).toHaveValue('implication');
    // Implication's description now shows twice -- once in the ordinary
    // single-selection paragraph, once still in the comparison panel
    // below it -- so assert the single-selection paragraph specifically
    // rather than a getByText that would match both.
    expect(document.querySelector('.new-block-type-description').textContent).toBe(
      blockRegistry.implication.description
    );
  });
});
