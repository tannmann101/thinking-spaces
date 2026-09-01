import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MilestoneBlock from './MilestoneBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'ms-1', content, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('MilestoneBlock: reached toggle', () => {
  it('marks reached and stamps today\'s date when checked', async () => {
    const user = userEvent.setup();
    render(<MilestoneBlock block={makeBlock({ label: 'Ship it', targetDate: null, reached: false, reachedAt: null, note: '' })} />);
    await user.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'ms-1',
        expect.objectContaining({ reached: true, reachedAt: new Date().toISOString().slice(0, 10) })
      )
    );
  });

  it('clears reachedAt when unchecked', async () => {
    const user = userEvent.setup();
    render(<MilestoneBlock block={makeBlock({ label: 'Done', targetDate: null, reached: true, reachedAt: '2024-01-01', note: '' })} />);
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('ms-1', expect.objectContaining({ reached: false, reachedAt: null }))
    );
  });

  it('shows a "Reached" badge once reached', () => {
    render(<MilestoneBlock block={makeBlock({ label: 'Done', targetDate: null, reached: true, reachedAt: '2024-01-01', note: '' })} />);
    expect(screen.getByText('Reached 2024-01-01')).toBeInTheDocument();
  });
});

describe('MilestoneBlock: overdue', () => {
  it('shows an Overdue badge for a past target date that is not yet reached', () => {
    render(<MilestoneBlock block={makeBlock({ label: 'Late', targetDate: '2000-01-01', reached: false, reachedAt: null, note: '' })} />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('does not show Overdue once reached, even past its target date', () => {
    render(<MilestoneBlock block={makeBlock({ label: 'Late but done', targetDate: '2000-01-01', reached: true, reachedAt: '2000-01-02', note: '' })} />);
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('does not show Overdue for a future target date', () => {
    render(<MilestoneBlock block={makeBlock({ label: 'On track', targetDate: '2099-01-01', reached: false, reachedAt: null, note: '' })} />);
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });
});

describe('MilestoneBlock: label and note', () => {
  it('shows a placeholder for an untitled Milestone', () => {
    render(<MilestoneBlock block={makeBlock({ label: '', targetDate: null, reached: false, reachedAt: null, note: '' })} />);
    expect(screen.getByText('(untitled milestone -- click to name it)')).toBeInTheDocument();
  });

  it('edits and saves the label', async () => {
    const user = userEvent.setup();
    render(<MilestoneBlock block={makeBlock({ label: 'Old label', targetDate: null, reached: false, reachedAt: null, note: '' })} />);
    await user.click(screen.getByText('Old label'));
    const input = screen.getByDisplayValue('Old label');
    await user.clear(input);
    await user.type(input, 'New label');
    await user.tab();

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('ms-1', expect.objectContaining({ label: 'New label' })));
  });

  it('edits and saves the note', async () => {
    const user = userEvent.setup();
    render(<MilestoneBlock block={makeBlock({ label: 'X', targetDate: null, reached: false, reachedAt: null, note: '' })} />);
    await user.click(screen.getByText('(add a note)'));
    await user.type(screen.getByRole('textbox'), 'Context here');
    await user.tab();

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('ms-1', expect.objectContaining({ note: 'Context here' })));
  });
});

describe('MilestoneBlock: target date', () => {
  it('updates targetDate when the date input changes', async () => {
    const user = userEvent.setup();
    render(<MilestoneBlock block={makeBlock({ label: 'X', targetDate: null, reached: false, reachedAt: null, note: '' })} />);
    const dateInput = screen.getByDisplayValue('');
    await user.type(dateInput, '2026-12-25');
    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('ms-1', expect.objectContaining({ targetDate: '2026-12-25' })));
  });
});

describe('MilestoneBlock: onSave override (a Comparison side)', () => {
  it('routes a change through onSave instead of updateBlockContent', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MilestoneBlock block={makeBlock({ label: 'X', targetDate: null, reached: false, reachedAt: null, note: '' }, { id: undefined })} onSave={onSave} />);
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ reached: true })));
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});

describe('MilestoneBlock: read-only mode', () => {
  it('disables the checkbox and date input, and shows no editing placeholders', () => {
    render(<MilestoneBlock block={makeBlock({ label: '', targetDate: null, reached: false, reachedAt: null, note: '' }, { id: undefined })} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByDisplayValue('')).toBeDisabled();
    expect(screen.queryByText('(add a note)')).not.toBeInTheDocument();
  });
});
