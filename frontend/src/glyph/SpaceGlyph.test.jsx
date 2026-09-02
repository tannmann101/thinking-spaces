import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SpaceGlyph from './SpaceGlyph.jsx';

function makeSpace(overrides = {}) {
  return {
    id: 'space-1',
    status: 'active',
    relationDensity: 2,
    openTensionCount: 1,
    theme: null,
    ...overrides,
  };
}

describe('SpaceGlyph', () => {
  it('renders an accessible label describing status, connections, and open tensions', () => {
    const { container } = render(<SpaceGlyph space={makeSpace()} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Visual identity: active, 2 connections, 1 open tensions');
  });

  it('includes a native <title> element with the same text, so a mouse hover explains the glyph too', () => {
    const { container } = render(<SpaceGlyph space={makeSpace()} />);
    const title = container.querySelector('svg > title');
    expect(title).toHaveTextContent('Visual identity: active, 2 connections, 1 open tensions');
  });

  it('draws in the Space\'s own themed accent, so a personalized Space is personalized here too', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ theme: { accent: 'teal' } })} />);
    expect(container.querySelector('line')).toHaveAttribute('stroke', 'var(--theme-accent-teal)');
  });

  it('falls back to its type\'s default accent when the Space has no theme override', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ theme: null })} />);
    expect(container.querySelector('line')).toHaveAttribute('stroke', 'var(--theme-accent-neutral)');
  });

  it('mentions overdue in the description, and draws the trunk dashed, when the Space is overdue', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ isOverdue: true })} />);
    expect(container.querySelector('svg > title')).toHaveTextContent(
      'Visual identity: active, 2 connections, 1 open tensions, overdue'
    );
    const trunk = container.querySelector('svg > line');
    expect(trunk).toHaveAttribute('stroke-dasharray', '2,1.5');
  });

  it('draws the trunk solid when not overdue', () => {
    const { container } = render(<SpaceGlyph space={makeSpace()} />);
    const trunk = container.querySelector('svg > line');
    expect(trunk).not.toHaveAttribute('stroke-dasharray');
  });

  it('mentions Milestone progress in the description, and draws one ring per Milestone', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ milestoneStats: { reached: 1, total: 3 } })} />);
    expect(container.querySelector('svg > title')).toHaveTextContent(
      'Visual identity: active, 2 connections, 1 open tensions, 1/3 milestones reached'
    );
    // 3 Milestone rings plus the branch-tip circles already drawn for
    // relationDensity: 2 -- scoped to just the rings' own filled state
    // via their radius (1.1, distinct from branch tips' 1.4).
    const rings = [...container.querySelectorAll('svg > circle')];
    expect(rings).toHaveLength(3);
    expect(rings.filter((c) => c.getAttribute('fill') !== 'none')).toHaveLength(1);
  });

  it('omits Milestone rings entirely when the Space has no Milestones', () => {
    const { container } = render(<SpaceGlyph space={makeSpace({ milestoneStats: { reached: 0, total: 0 } })} />);
    expect(container.querySelectorAll('svg > circle')).toHaveLength(0);
  });
});
