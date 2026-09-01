import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopNav from './TopNav.jsx';

function renderNav(current) {
  render(
    <MemoryRouter>
      <TopNav current={current} />
    </MemoryRouter>
  );
}

describe('TopNav', () => {
  it('renders the wordmark as a link back to the Dashboard', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /Thinking Spaces/ })).toHaveAttribute('href', '/');
  });

  it('renders all five top-level nav links to their correct routes', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: 'Manage Templates' })).toHaveAttribute('href', '/templates');
    expect(screen.getByRole('link', { name: 'View the Map' })).toHaveAttribute('href', '/graph');
    expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('href', '/log');
  });

  it('marks the current page\'s nav link, and no other, as current', () => {
    renderNav('tools');
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveClass('nav-link-current');
    expect(screen.getByRole('link', { name: 'Insights' })).not.toHaveClass('nav-link-current');
    expect(screen.getByRole('link', { name: 'Log' })).not.toHaveClass('nav-link-current');
  });

  it('marks no nav link as current when on a non-top-level page (e.g. a Space)', () => {
    renderNav(undefined);
    ['Insights', 'Tools', 'Manage Templates', 'View the Map', 'Log'].forEach((name) => {
      expect(screen.getByRole('link', { name })).not.toHaveClass('nav-link-current');
    });
  });
});
