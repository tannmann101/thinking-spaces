import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LedgerView from './LedgerView.jsx';

function block(items) {
  return { content: { items } };
}

describe('LedgerView', () => {
  it('computes a running total across items, in order', () => {
    render(
      <LedgerView
        block={block([
          { id: '1', text: 'Starting balance', number: 100 },
          { id: '2', text: 'Spent on research', number: -20 },
          { id: '3', text: 'Refund', number: 5 },
        ])}
      />
    );
    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows[0]).toHaveTextContent('Starting balance');
    expect(rows[0]).toHaveTextContent('100');
    expect(rows[1]).toHaveTextContent('80'); // 100 - 20
    expect(rows[2]).toHaveTextContent('85'); // 80 + 5
  });

  it('excludes items with no number property', () => {
    render(<LedgerView block={block([{ id: '1', text: 'Has number', number: 10 }, { id: '2', text: 'No number' }])} />);
    expect(screen.queryByText('No number')).not.toBeInTheDocument();
  });

  it('renders an empty table for a list with no numbered items', () => {
    render(<LedgerView block={block([{ id: '1', text: 'x' }])} />);
    expect(screen.getAllByRole('row')).toHaveLength(1); // header only
  });
});
