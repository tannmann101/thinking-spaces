import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderTextWithLinks } from './textLinks.jsx';

function Wrapper({ text, fromSpaceId }) {
  return <p>{renderTextWithLinks(text, fromSpaceId)}</p>;
}

function renderWithRouter(text, fromSpaceId) {
  render(
    <MemoryRouter>
      <Wrapper text={text} fromSpaceId={fromSpaceId} />
    </MemoryRouter>
  );
}

describe('renderTextWithLinks', () => {
  it('renders plain text with no links unchanged', () => {
    renderWithRouter('just some plain text', undefined);
    expect(screen.getByText('just some plain text')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a [[spaceId|Title]] wiki-link as a real link showing the title', () => {
    renderWithRouter('See [[abc-123|My Other Space]] for more.', undefined);
    const link = screen.getByRole('link', { name: 'My Other Space' });
    expect(link).toHaveAttribute('href', '/spaces/abc-123');
  });

  it('preserves the surrounding text before and after the link', () => {
    renderWithRouter('Before [[abc-123|Title]] after.', undefined);
    expect(screen.getByText('Before', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('after.', { exact: false })).toBeInTheDocument();
  });

  it('renders multiple links in one string', () => {
    renderWithRouter('[[a-1|First]] and [[b-2|Second]]', undefined);
    expect(screen.getByRole('link', { name: 'First' })).toHaveAttribute('href', '/spaces/a-1');
    expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute('href', '/spaces/b-2');
  });

  it('appends ?from=<fromSpaceId> to the link when given', () => {
    renderWithRouter('[[abc-123|Title]]', 'origin-space');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/spaces/abc-123?from=origin-space');
  });

  it('omits ?from= when fromSpaceId is not given', () => {
    renderWithRouter('[[abc-123|Title]]', undefined);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/spaces/abc-123');
  });

  it('does not treat malformed [[...]] syntax as a link', () => {
    renderWithRouter('[[not a real link]]', undefined);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('is reusable across repeated calls (regex lastIndex does not leak between calls)', () => {
    // LINK_PATTERN is a module-level /g regex -- exec() mutates its own
    // lastIndex, so a naive implementation could let one call's state
    // bleed into the next. renderTextWithLinks resets lastIndex = 0
    // itself specifically to guard against that.
    renderTextWithLinks('[[a-1|First]]', undefined);
    renderWithRouter('[[b-2|Second]]', undefined);
    expect(screen.getByRole('link', { name: 'Second' })).toBeInTheDocument();
  });
});
