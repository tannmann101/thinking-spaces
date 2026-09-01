import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { usePageTitle } from './usePageTitle.js';

function TitleSetter({ title }) {
  usePageTitle(title);
  return null;
}

describe('usePageTitle', () => {
  it('sets document.title to "<title> — Thinking Spaces"', () => {
    render(<TitleSetter title="Insights" />);
    expect(document.title).toBe('Insights — Thinking Spaces');
  });

  it('falls back to the bare app name when given a falsy title', () => {
    render(<TitleSetter title={null} />);
    expect(document.title).toBe('Thinking Spaces');
  });

  it('updates document.title when the title prop changes (e.g. once a Space finishes loading)', () => {
    const { rerender } = render(<TitleSetter title={null} />);
    expect(document.title).toBe('Thinking Spaces');
    rerender(<TitleSetter title="My Space" />);
    expect(document.title).toBe('My Space — Thinking Spaces');
  });
});
