import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionBlock from './SessionBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'sess-1', content, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionBlock: not started', () => {
  it('shows a Start button and no elapsed/completed text', () => {
    render(<SessionBlock block={makeBlock({ label: '', startedAt: null, endedAt: null, durationMinutes: null, note: '' })} />);
    expect(screen.getByRole('button', { name: '▶ Start' })).toBeInTheDocument();
    expect(screen.queryByText(/elapsed/)).not.toBeInTheDocument();
  });

  it('hides the Start button when not editable', () => {
    render(<SessionBlock block={makeBlock({ label: '', startedAt: null, endedAt: null, durationMinutes: null, note: '' }, { id: undefined })} />);
    expect(screen.queryByRole('button', { name: '▶ Start' })).not.toBeInTheDocument();
  });
});

describe('SessionBlock: starting', () => {
  it('starting sets startedAt to now and clears endedAt/durationMinutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
    const user = userEvent.setup({ delay: null });
    render(<SessionBlock block={makeBlock({ label: '', startedAt: null, endedAt: null, durationMinutes: null, note: '' })} />);

    await user.click(screen.getByRole('button', { name: '▶ Start' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null })
      )
    );
  });
});

describe('SessionBlock: running', () => {
  it('shows live elapsed time computed from startedAt, and a Stop button', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-06-01T10:20:00.000Z'));
    render(
      <SessionBlock
        block={makeBlock({ label: '', startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null, note: '' })}
      />
    );
    expect(screen.getByText('Running -- 20m elapsed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '■ Stop' })).toBeInTheDocument();
  });

  it('hides the Stop button when not editable, but still shows elapsed time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-06-01T10:05:00.000Z'));
    render(
      <SessionBlock
        block={makeBlock({ label: '', startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null, note: '' }, { id: undefined })}
      />
    );
    expect(screen.getByText('Running -- 5m elapsed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '■ Stop' })).not.toBeInTheDocument();
  });

  it('stopping computes durationMinutes from startedAt to now and persists it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
    const user = userEvent.setup({ delay: null });
    render(
      <SessionBlock block={makeBlock({ label: '', startedAt: '2024-06-01T10:00:00.000Z', endedAt: null, durationMinutes: null, note: '' })} />
    );

    vi.setSystemTime(new Date('2024-06-01T10:45:00.000Z'));
    await user.click(screen.getByRole('button', { name: '■ Stop' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ endedAt: '2024-06-01T10:45:00.000Z', durationMinutes: 45 })
      )
    );
  });
});

describe('SessionBlock: completed', () => {
  it('shows the formatted duration and the start/end times, with no Start or Stop button', () => {
    render(
      <SessionBlock
        block={makeBlock({
          label: 'Drafting',
          startedAt: '2024-06-01T10:00:00.000Z',
          endedAt: '2024-06-01T11:30:00.000Z',
          durationMinutes: 90,
          note: '',
        })}
      />
    );
    expect(screen.getByText('1h 30m', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '▶ Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '■ Stop' })).not.toBeInTheDocument();
  });
});

describe('SessionBlock: label and note', () => {
  it('edits and saves the label', async () => {
    const user = userEvent.setup();
    render(<SessionBlock block={makeBlock({ label: 'Old label', startedAt: null, endedAt: null, durationMinutes: null, note: '' })} />);
    await user.click(screen.getByText('Old label'));
    const input = screen.getByDisplayValue('Old label');
    await user.clear(input);
    await user.type(input, 'New label');
    await user.tab();

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('sess-1', expect.objectContaining({ label: 'New label' })));
  });

  it('edits and saves the note', async () => {
    const user = userEvent.setup();
    render(<SessionBlock block={makeBlock({ label: 'X', startedAt: null, endedAt: null, durationMinutes: null, note: '' })} />);
    await user.click(screen.getByText('(add a note)'));
    await user.type(screen.getByRole('textbox'), 'Context');
    await user.tab();

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('sess-1', expect.objectContaining({ note: 'Context' })));
  });
});

describe('SessionBlock: onSave override (a Comparison side)', () => {
  it('routes Start through onSave instead of updateBlockContent', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SessionBlock block={makeBlock({ label: '', startedAt: null, endedAt: null, durationMinutes: null, note: '' }, { id: undefined })} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: '▶ Start' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});
