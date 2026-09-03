import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportPanel from './ExportPanel.jsx';

// jsdom has no object-URL implementation and won't follow a download, so
// both are stubbed -- the assertions below are about which route was
// fetched and how a failure surfaces, not about the browser's own
// save-file behaviour.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  global.URL.createObjectURL = vi.fn(() => 'blob:fake');
  global.URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }));
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ExportPanel', () => {
  it('offers both the backup and the readable archive, and says which is which', () => {
    render(<ExportPanel onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeInTheDocument();
    expect(screen.getByText(/The real backup/)).toBeInTheDocument();
    expect(screen.getByText(/not something to restore from/)).toBeInTheDocument();
  });

  it('fetches the JSON route and hands the browser a file', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExportPanel onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/export/json'));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('fetches the Markdown route for the other button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExportPanel onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/export/markdown'));
  });

  it('surfaces a failure in the panel rather than navigating away silently', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExportPanel onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(await screen.findByText(/Export failed \(500\)/)).toBeInTheDocument();
  });

  it('closes when asked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExportPanel onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
