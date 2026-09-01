import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TextBlock from './TextBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderBlock(props) {
  return render(
    <MemoryRouter>
      <TextBlock {...props} />
    </MemoryRouter>
  );
}

function makeBlock(lines, overrides = {}) {
  return {
    id: 'block-1',
    space_id: 'space-1',
    content: { lines },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('TextBlock: read-only rendering', () => {
  it('renders each line\'s text', () => {
    renderBlock({ block: makeBlock([{ id: '1', text: 'First line', tag: null }, { id: '2', text: 'Second line', tag: null }]) });
    expect(screen.getByText('First line')).toBeInTheDocument();
    expect(screen.getByText('Second line')).toBeInTheDocument();
  });

  it('shows a line\'s attribution tag when it has one', () => {
    renderBlock({ block: makeBlock([{ id: '1', text: 'A quote', tag: 'quote' }]) });
    expect(screen.getByText('quote')).toBeInTheDocument();
  });

  it('renders an embedded [[id|Title]] link as a real link, carrying ?from= back to this block\'s own Space', () => {
    renderBlock({ block: makeBlock([{ id: '1', text: 'See [[abc|Other Space]].', tag: null }]) });
    expect(screen.getByRole('link', { name: 'Other Space' })).toHaveAttribute('href', '/spaces/abc?from=space-1');
  });

  it('renders the legacy {tag, text} shape (a Comparison side)', () => {
    renderBlock({ block: makeBlock(undefined, { id: undefined, content: { tag: 'reflection', text: 'Legacy content' } }) });
    expect(screen.getByText('Legacy content')).toBeInTheDocument();
    expect(screen.getByText('reflection')).toBeInTheDocument();
  });

  it('is not clickable/editable when it has no id and no onSave (e.g. a Tools-catalog demo)', async () => {
    const user = userEvent.setup();
    renderBlock({ block: makeBlock([{ id: '1', text: 'Demo text', tag: null }], { id: undefined }) });
    await user.click(screen.getByText('Demo text'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('TextBlock: editing a standalone block', () => {
  it('opens a textarea joining every line on click, and saves via saveTextBlock', async () => {
    const user = userEvent.setup();
    api.saveTextBlock.mockResolvedValue({ content: { lines: [{ id: '1', text: 'Edited text', tag: null }] } });
    const onBlocksChanged = vi.fn();
    renderBlock({ block: makeBlock([{ id: '1', text: 'Original text', tag: null }]), onBlocksChanged });

    await user.click(screen.getByText('Original text'));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Original text');

    await user.clear(textarea);
    await user.type(textarea, 'Edited text');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(api.saveTextBlock).toHaveBeenCalled());
    const [blockId, sentLines] = api.saveTextBlock.mock.calls[0];
    expect(blockId).toBe('block-1');
    expect(sentLines[0].text).toBe('Edited text');
    expect(onBlocksChanged).toHaveBeenCalled();
  });

  it('renders whatever lines the backend actually returns after save (promotion may have changed them)', async () => {
    const user = userEvent.setup();
    // Simulate the backend stripping a promoted "=" shorthand line.
    api.saveTextBlock.mockResolvedValue({ content: { lines: [] } });
    renderBlock({ block: makeBlock([{ id: '1', text: '= a premise', tag: null }]) });

    await user.click(screen.getByText('= a premise'));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByText('= a premise')).not.toBeInTheDocument());
  });
});

describe('TextBlock: onSave override (a Comparison side)', () => {
  it('calls onSave with updated content instead of saveTextBlock, when the text actually changed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBlock({ block: makeBlock(undefined, { id: undefined, content: { tag: null, text: 'Option A' } }), onSave });

    await user.click(screen.getByText('Option A'));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Option A revised');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ tag: null, text: 'Option A revised' }));
    expect(api.saveTextBlock).not.toHaveBeenCalled();
  });

  it('does not call onSave at all when the text is unchanged', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderBlock({ block: makeBlock(undefined, { id: undefined, content: { tag: null, text: 'Option A' } }), onSave });

    await user.click(screen.getByText('Option A'));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('TextBlock: [[ link suggestion', () => {
  it('inserts a [[id|Title]] link when a suggested Space is picked', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([{ id: 'a', title: 'Alpha Space' }]);
    api.saveTextBlock.mockResolvedValue({ content: { lines: [{ id: '1', text: 'See [[a|Alpha Space]]', tag: null }] } });
    renderBlock({ block: makeBlock([{ id: '1', text: 'See ', tag: null }]) });

    await user.click(screen.getByText('See', { exact: false }));
    const textarea = screen.getByRole('textbox');
    // userEvent.type() treats a single "[" as the start of special key
    // syntax (like "{Enter}") -- doubling each bracket types a literal
    // one, so "[[[[Alpha" types the literal text "[[Alpha".
    await user.type(textarea, '[[[[Alpha');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha Space' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Alpha Space' }));
    expect(textarea).toHaveValue('See [[a|Alpha Space]]');
  });
});
