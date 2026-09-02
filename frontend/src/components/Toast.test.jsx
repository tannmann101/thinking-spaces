import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from './Toast.jsx';
import * as api from '../api.js';

vi.mock('../api.js', () => ({ setMutationListener: vi.fn() }));

let registeredListener = null;

beforeEach(() => {
  vi.useFakeTimers();
  api.setMutationListener.mockImplementation((fn) => {
    registeredListener = fn;
  });
});

afterEach(() => {
  vi.useRealTimers();
  registeredListener = null;
});

describe('ToastProvider', () => {
  it('registers itself with api.js on mount, and unregisters on unmount', () => {
    const { unmount } = render(<ToastProvider>content</ToastProvider>);
    expect(api.setMutationListener).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(api.setMutationListener).toHaveBeenLastCalledWith(null);
  });

  it('shows whatever message the listener is called with, then fades after its visible window', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('Saved'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3201));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows a content-aware changeSummary sentence verbatim, not just a generic word', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('Milestone reached -- now counted in Insights and the Week digest'));
    expect(screen.getByText('Milestone reached -- now counted in Insights and the Week digest')).toBeInTheDocument();
  });

  it('shows "Deleted" after a delete', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('Deleted'));
    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  it('a second mutation while already showing resets the timer instead of stacking', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('Saved'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    act(() => registeredListener('Saved'));
    act(() => vi.advanceTimersByTime(2000));
    // Still visible -- the second call reset the 3200ms window, so this
    // is only 2000ms into the new window, not 4000ms into the first.
    expect(screen.getAllByText('Saved')).toHaveLength(1);
  });
});
