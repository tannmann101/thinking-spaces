import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SpaceGlyph from './SpaceGlyph.jsx';

function makeSpace(overrides = {}) {
  return {
    id: 'space-1',
    status: 'developing',
    relationDensity: 2,
    openTensionCount: 1,
    accent: null,
    ...overrides,
  };
}

describe('SpaceGlyph', () => {
  it('renders an accessible label describing status, connections, and open tensions', () => {
    const { container } = render(<SpaceGlyph space={makeSpace()} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Visual identity: developing, 2 connections, 1 open tensions');
  });

  it('includes a native <title> element with the same text, so a mouse hover explains the glyph too', () => {
    const { container } = render(<SpaceGlyph space={makeSpace()} />);
    const title = container.querySelector('svg > title');
    expect(title).toHaveTextContent('Visual identity: developing, 2 connections, 1 open tensions');
  });

  it('mentions the manual accent in the description when one is set', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ accent: 'star' })} />);
    expect(container.querySelector('svg > title')).toHaveTextContent(
      'Visual identity: developing, 2 connections, 1 open tensions, star accent'
    );
  });
});
