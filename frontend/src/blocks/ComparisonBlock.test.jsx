import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ComparisonBlock from './ComparisonBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'cmp-1', space_id: 'space-1', content, ...overrides };
}

function renderBlock(props) {
  return render(
    <MemoryRouter>
      <ComparisonBlock {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('ComparisonBlock: sides', () => {
  it('renders both text sides\' content', () => {
    renderBlock({
      block: makeBlock({
        left: { kind: 'text', tag: null, text: 'Option A' },
        right: { kind: 'text', tag: null, text: 'Option B' },
        contrast: false,
      }),
    });
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders a reference side as a real link', () => {
    renderBlock({
      block: makeBlock({
        left: { kind: 'reference', target_space_id: 'x', targetSpaceTitle: 'X Space', note: null },
        right: { kind: 'text', tag: null, text: 'Option B' },
        contrast: false,
      }),
    });
    expect(screen.getByRole('link', { name: 'X Space' })).toBeInTheDocument();
  });

  it('shows a fallback for an unrecognized side kind', () => {
    renderBlock({ block: makeBlock({ left: { kind: 'mystery' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: false }) });
    expect(screen.getByText('Unknown comparison side: mystery')).toBeInTheDocument();
  });

  it('saves an edited text side back into this Comparison block\'s own content', async () => {
    const user = userEvent.setup();
    const onBlocksChanged = vi.fn();
    renderBlock({
      block: makeBlock({ left: { kind: 'text', tag: null, text: 'Option A' }, right: { kind: 'text', tag: null, text: 'Option B' }, contrast: false }),
      onBlocksChanged,
    });

    await user.click(screen.getByText('Option A'));
    const input = screen.getByDisplayValue('Option A');
    await user.clear(input);
    await user.type(input, 'Option A revised');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'cmp-1',
        expect.objectContaining({ left: expect.objectContaining({ text: 'Option A revised' }) })
      )
    );
    expect(onBlocksChanged).toHaveBeenCalled();
  });
});

describe('ComparisonBlock: contrast marker', () => {
  it('shows "(not marked as a contrast)" by default', () => {
    renderBlock({ block: makeBlock({ left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: false }) });
    expect(screen.getByText(/not marked as a contrast/)).toBeInTheDocument();
  });

  it('toggles the contrast flag on click', async () => {
    const user = userEvent.setup();
    renderBlock({ block: makeBlock({ left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: false }) });
    await user.click(screen.getByText(/not marked as a contrast/));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('cmp-1', expect.objectContaining({ contrast: true }))
    );
  });

  it('shows and edits a contrast note only once marked as a contrast', async () => {
    const user = userEvent.setup();
    renderBlock({
      block: makeBlock({ left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: true, contrastNote: '' }),
    });
    expect(screen.getByText('(add a note)')).toBeInTheDocument();

    await user.click(screen.getByText('(add a note)'));
    await user.type(screen.getByRole('textbox'), 'why they contrast');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('cmp-1', expect.objectContaining({ contrastNote: 'why they contrast' }))
    );
  });

  it('hides the whole contrast row when not editable and not marked as a contrast', () => {
    renderBlock({
      block: makeBlock({ left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: false }, { id: undefined }),
    });
    expect(screen.queryByText(/contrast/)).not.toBeInTheDocument();
  });

  it('still shows an already-marked contrast even when not editable', () => {
    renderBlock({
      block: makeBlock({ left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: true, contrastNote: 'Speed vs. cost' }, { id: undefined }),
    });
    expect(screen.getByText(/Marked as a contrast/)).toBeInTheDocument();
    expect(screen.getByText('Speed vs. cost')).toBeInTheDocument();
  });

  it('routes the contrast toggle through onSave instead, for an id-less demo', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBlock({
      block: makeBlock(
        { left: { kind: 'text', tag: null, text: 'A' }, right: { kind: 'text', tag: null, text: 'B' }, contrast: false },
        { id: undefined }
      ),
      onSave,
    });
    await user.click(screen.getByText(/not marked as a contrast/));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contrast: true })));
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});
