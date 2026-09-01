import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TopNav from './TopNav.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderNav(current) {
  render(
    <MemoryRouter>
      <TopNav current={current} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getNotificationCount.mockResolvedValue({ count: 0 });
});

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

describe('TopNav: needs-attention badge', () => {
  it('shows nothing when the count is zero', async () => {
    renderNav();
    await waitFor(() => expect(api.getNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTitle(/item\(s\) need attention/)).not.toBeInTheDocument();
  });

  it('shows the count, linking to the Dashboard, when there is something to attend to', async () => {
    api.getNotificationCount.mockResolvedValue({ count: 3 });
    renderNav();
    const badge = await screen.findByTitle('3 item(s) need attention');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('href', '/');
  });

  it('degrades to showing nothing rather than crashing when the fetch fails', async () => {
    api.getNotificationCount.mockRejectedValue(new Error('down'));
    renderNav();
    await waitFor(() => expect(api.getNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTitle(/item\(s\) need attention/)).not.toBeInTheDocument();
  });
});

describe('TopNav: quick capture', () => {
  it('opens a title field on click, and closes it again on blur if left empty', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    const input = screen.getByPlaceholderText("Quick capture: what's on your mind?");
    expect(input).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByPlaceholderText("Quick capture: what's on your mind?")).not.toBeInTheDocument();
  });

  it('creates a blank Space from just a title, and navigates to it', async () => {
    const user = userEvent.setup();
    api.createSpace.mockResolvedValue({ id: 'new-space-id' });
    renderNav();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("Quick capture: what's on your mind?"), 'A stray thought{Enter}');

    await waitFor(() => expect(api.createSpace).toHaveBeenCalledWith({ title: 'A stray thought' }));
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-space-id');
  });

  it('does not submit an empty or whitespace-only title', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("Quick capture: what's on your mind?"), '   {Enter}');
    expect(api.createSpace).not.toHaveBeenCalled();
  });
});
