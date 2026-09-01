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

  it('shows "Saved" after a PATCH-kind mutation, then fades after its visible window', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('saved'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2001));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows "Deleted" after a DELETE-kind mutation', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('deleted'));
    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  it('a second mutation while already showing resets the timer instead of stacking', () => {
    render(<ToastProvider>content</ToastProvider>);
    act(() => registeredListener('saved'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    act(() => registeredListener('saved'));
    act(() => vi.advanceTimersByTime(1500));
    // Still visible -- the second call reset the 2000ms window, so this
    // is only 1500ms into the new window, not 3000ms into the first.
    expect(screen.getAllByText('Saved')).toHaveLength(1);
  });
});
