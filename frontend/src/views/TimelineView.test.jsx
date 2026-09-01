import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimelineView from './TimelineView.jsx';

function block(items) {
  return { content: { items } };
}

describe('TimelineView', () => {
  it('shows only items that carry a date', () => {
    render(<TimelineView block={block([{ id: '1', text: 'Dated', date: '2024-01-01' }, { id: '2', text: 'Undated' }])} />);
    expect(screen.getByText('Dated')).toBeInTheDocument();
    expect(screen.queryByText('Undated')).not.toBeInTheDocument();
  });

  it('sorts items chronologically regardless of input order', () => {
    render(
      <TimelineView
        block={block([
          { id: '1', text: 'Second', date: '2024-06-01' },
          { id: '2', text: 'First', date: '2024-01-01' },
        ])}
      />
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('First');
    expect(items[1]).toContain('Second');
  });

  it('renders an empty timeline when there are no dated items', () => {
    render(<TimelineView block={block([])} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
