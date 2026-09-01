import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import StreakView from './StreakView.jsx';

function block(items) {
  return { content: { items } };
}

describe('StreakView', () => {
  it('renders nothing for a list with no date+checkbox items', () => {
    const { container } = render(<StreakView block={block([{ id: '1', text: 'no shape' }])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks a checked day as done and an unchecked day as miss, padding the rest of the week as empty', () => {
    const { container } = render(
      <StreakView
        block={block([
          { id: '1', text: 'Day', date: '2024-01-02', checkbox: true },
          { id: '2', text: 'Day', date: '2024-01-03', checkbox: false },
        ])}
      />
    );
    // 2024-01-02 (Tue) to 2024-01-03 (Wed) pads to one full week (Sun
    // 2023-12-31 through Sat 2024-01-06) -- exactly one row of 7 cells.
    expect(container.querySelectorAll('tr')).toHaveLength(1);
    const cells = container.querySelectorAll('.streak-cell');
    expect(cells).toHaveLength(7);

    const doneCells = container.querySelectorAll('.streak-cell.done');
    const missCells = container.querySelectorAll('.streak-cell.miss');
    const emptyCells = container.querySelectorAll('.streak-cell.empty');
    expect(doneCells).toHaveLength(1);
    expect(missCells).toHaveLength(1);
    expect(emptyCells).toHaveLength(5);
    expect(doneCells[0]).toHaveTextContent('2');
    expect(missCells[0]).toHaveTextContent('3');
  });

  it('shows no day number in an empty padding cell', () => {
    const { container } = render(
      <StreakView block={block([{ id: '1', text: 'Day', date: '2024-01-02', checkbox: true }])} />
    );
    const empty = container.querySelector('.streak-cell.empty');
    expect(empty).toHaveTextContent('');
  });
});
