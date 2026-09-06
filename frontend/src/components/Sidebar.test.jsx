import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderSidebar(current) {
  render(
    <MemoryRouter>
      <Sidebar current={current} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getNotificationCount.mockResolvedValue({ count: 0 });
});

describe('Sidebar', () => {
  it('renders the wordmark as a link back to the Dashboard', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /Thinking Spaces/ })).toHaveAttribute('href', '/');
  });

  it('renders all five top-level nav links to their correct routes', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: 'Manage Templates' })).toHaveAttribute('href', '/templates');
    expect(screen.getByRole('link', { name: 'View the Map' })).toHaveAttribute('href', '/graph');
    expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('href', '/log');
  });

  it('reaches Projects and Goals, the two top-level pages that hold no Space', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Goals' })).toHaveAttribute('href', '/goals');
  });

  it('marks the current page\'s nav link, and no other, as current', () => {
    renderSidebar('tools');
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveClass('nav-link-current');
    expect(screen.getByRole('link', { name: 'Insights' })).not.toHaveClass('nav-link-current');
    expect(screen.getByRole('link', { name: 'Log' })).not.toHaveClass('nav-link-current');
  });

  it('marks no nav link as current when on a non-top-level page (e.g. a Space)', () => {
    renderSidebar(undefined);
    ['Insights', 'Tools', 'Manage Templates', 'View the Map', 'Log'].forEach((name) => {
      expect(screen.getByRole('link', { name })).not.toHaveClass('nav-link-current');
    });
  });
});

describe('Sidebar: needs-attention badge', () => {
  it('shows nothing when the count is zero', async () => {
    renderSidebar();
    await waitFor(() => expect(api.getNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTitle(/item\(s\) need attention/)).not.toBeInTheDocument();
  });

  it('shows the count, linking to the Dashboard, when there is something to attend to', async () => {
    api.getNotificationCount.mockResolvedValue({ count: 3 });
    renderSidebar();
    const badge = await screen.findByTitle('3 item(s) need attention');
    expect(badge).toHaveTextContent('3 items need attention');
    expect(badge).toHaveAttribute('href', '/');
  });

  it('uses singular phrasing for exactly one item', async () => {
    api.getNotificationCount.mockResolvedValue({ count: 1 });
    renderSidebar();
    const badge = await screen.findByTitle('1 item(s) need attention');
    expect(badge).toHaveTextContent('1 item needs attention');
  });

  it('degrades to showing nothing rather than crashing when the fetch fails', async () => {
    api.getNotificationCount.mockRejectedValue(new Error('down'));
    renderSidebar();
    await waitFor(() => expect(api.getNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTitle(/item\(s\) need attention/)).not.toBeInTheDocument();
  });
});

describe('Sidebar: quick capture', () => {
  it('opens a field on click, and closes it again on blur if left empty', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByPlaceholderText("What's on your mind?")).not.toBeInTheDocument();
  });

  // The thought itself is the content -- capture deliberately does not
  // mint a Space and does not name one.
  it('captures the thought to the Inbox rather than creating a Space', async () => {
    const user = userEvent.setup();
    api.captureThought.mockResolvedValue({});
    renderSidebar();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("What's on your mind?"), 'A stray thought{Enter}');

    await waitFor(() => expect(api.captureThought).toHaveBeenCalledWith('A stray thought'));
    expect(api.createSpace).not.toHaveBeenCalled();
  });

  // Capturing should not interrupt whatever you were doing.
  it('stays on the current page after capturing', async () => {
    const user = userEvent.setup();
    api.captureThought.mockResolvedValue({});
    renderSidebar();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("What's on your mind?"), 'A stray thought{Enter}');

    await waitFor(() => expect(api.captureThought).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not submit an empty or whitespace-only thought', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("What's on your mind?"), '   {Enter}');
    expect(api.captureThought).not.toHaveBeenCalled();
  });
});

describe('Sidebar: the Inbox link', () => {
  it('shows how much is unfiled, and links to the Inbox', async () => {
    api.getNotificationCount.mockResolvedValue({ count: 0, inbox: 3 });
    renderSidebar();
    const link = await screen.findByRole('link', { name: /Inbox 3/ });
    expect(link).toHaveAttribute('href', '/spaces/inbox');
  });

  it('shows nothing when the Inbox is empty', async () => {
    api.getNotificationCount.mockResolvedValue({ count: 0, inbox: 0 });
    renderSidebar();
    await waitFor(() => expect(api.getNotificationCount).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Inbox/ })).not.toBeInTheDocument();
  });

  it('counts up as you capture, without a refetch', async () => {
    const user = userEvent.setup();
    api.getNotificationCount.mockResolvedValue({ count: 0, inbox: 1 });
    api.captureThought.mockResolvedValue({});
    renderSidebar();
    await screen.findByRole('link', { name: /Inbox 1/ });

    await user.click(screen.getByRole('button', { name: '+ Quick Capture' }));
    await user.type(screen.getByPlaceholderText("What's on your mind?"), 'another{Enter}');
    await screen.findByRole('link', { name: /Inbox 2/ });
  });
});

describe('Sidebar: legend', () => {
  it('opens the legend on click, and closes it again', async () => {
    const user = userEvent.setup();
    renderSidebar();
    expect(screen.queryByRole('dialog', { name: 'How to read this app' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '? How to read this app' }));
    expect(screen.getByRole('dialog', { name: 'How to read this app' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'How to read this app' })).not.toBeInTheDocument();
  });
});
