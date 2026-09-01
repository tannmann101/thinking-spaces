import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressView from './ProgressView.jsx';

function block(items) {
  return { content: { items } };
}

describe('ProgressView', () => {
  it('counts only items that actually carry a checkbox property', () => {
    render(
      <ProgressView
        block={block([
          { id: '1', text: 'a', checkbox: true },
          { id: '2', text: 'b', checkbox: false },
          { id: '3', text: 'c' }, // no checkbox at all -- not counted
        ])}
      />
    );
    expect(screen.getByText('1 of 2 complete')).toBeInTheDocument();
  });

  it('computes the fill percentage from done/total', () => {
    const { container } = render(
      <ProgressView block={block([{ id: '1', checkbox: true }, { id: '2', checkbox: true }, { id: '3', checkbox: false }, { id: '4', checkbox: false }])} />
    );
    expect(container.querySelector('.progress-fill')).toHaveStyle({ width: '50%' });
  });

  it('shows 0% and "0 of 0" for a list with no checkbox items at all', () => {
    const { container } = render(<ProgressView block={block([{ id: '1', text: 'no checkbox' }])} />);
    expect(screen.getByText('0 of 0 complete')).toBeInTheDocument();
    expect(container.querySelector('.progress-fill')).toHaveStyle({ width: '0%' });
  });
});
