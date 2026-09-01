import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListBlock from './ListBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'list-1', space_id: 'space-1', content, properties: {}, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('ListBlock: rendering', () => {
  it('renders each item\'s text', () => {
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'First' }, { id: '2', text: 'Second' }] })} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('shows "(empty)" for a labeled lane with no items', () => {
    render(<ListBlock block={makeBlock({ items: [], laneLabel: 'Premises' })} />);
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });

  it('shows the heading, or a placeholder to add one when editable', () => {
    render(<ListBlock block={makeBlock({ items: [] })} />);
    expect(screen.getByText('(add a heading)')).toBeInTheDocument();
  });
});

describe('ListBlock: checkbox items', () => {
  it('toggles a checkbox and saves the new state', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Task', checkbox: false }] })} />);
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ checkbox: true })] })
      )
    );
  });

  it('disables the checkbox when not editable (no block id)', () => {
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Task', checkbox: false }] }, { id: undefined })} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});

describe('ListBlock: confidence cycling', () => {
  it('cycles questioned -> tentative on click', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Claim', confidence: 'questioned' }] })} />);
    await user.click(screen.getByText('questioned'));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ confidence: 'tentative' })] })
      )
    );
  });

  it('wraps from certain back to questioned', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Claim', confidence: 'certain' }] })} />);
    await user.click(screen.getByText('certain'));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ confidence: 'questioned' })] })
      )
    );
  });
});

describe('ListBlock: flagged toggle', () => {
  it('shows a filled flag when flagged, an outline when not, and toggles on click', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'x', flagged: false }] })} />);
    expect(screen.getByText('⚐')).toBeInTheDocument();
    await user.click(screen.getByText('⚐'));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ flagged: true })] })
      )
    );
  });
});

describe('ListBlock: adding and removing items', () => {
  it('adds a new item with a shape inferred from the existing items', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Existing', checkbox: true }] })} />);
    await user.type(screen.getByPlaceholderText('+ Add item'), 'New item');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalled());
    const [, sentContent] = api.updateBlockContent.mock.calls[0];
    expect(sentContent.items).toHaveLength(2);
    expect(sentContent.items[1]).toMatchObject({ text: 'New item', checkbox: false });
  });

  it('disables Add until real text is typed', () => {
    render(<ListBlock block={makeBlock({ items: [] })} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removes an item', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Doomed' }] })} />);
    await user.click(screen.getByTitle('Remove item'));
    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('list-1', expect.objectContaining({ items: [] })));
  });
});

describe('ListBlock: reordering', () => {
  it('swaps two items on move down/up', async () => {
    const user = userEvent.setup();
    render(
      <ListBlock
        block={makeBlock({ items: [{ id: '1', text: 'First' }, { id: '2', text: 'Second' }] })}
      />
    );
    const [moveDownFirst] = screen.getAllByTitle('Move down (lower priority)');
    await user.click(moveDownFirst);
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '1' })] })
      )
    );
  });

  it('disables "move up" for the first item and "move down" for the last', () => {
    render(
      <ListBlock block={makeBlock({ items: [{ id: '1', text: 'First' }, { id: '2', text: 'Second' }] })} />
    );
    const [firstUp, secondUp] = screen.getAllByTitle('Move up (higher priority)');
    const [firstDown, secondDown] = screen.getAllByTitle('Move down (lower priority)');
    expect(firstUp).toBeDisabled();
    expect(secondUp).toBeEnabled();
    expect(firstDown).toBeEnabled();
    expect(secondDown).toBeDisabled();
  });
});

describe('ListBlock: editing item fields', () => {
  it('edits an item\'s text', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'Original' }] })} />);
    await user.click(screen.getByText('Original'));
    const input = screen.getByDisplayValue('Original');
    await user.clear(input);
    await user.type(input, 'Revised');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ text: 'Revised' })] })
      )
    );
  });

  it('parses a number field, keeping the old value if the new one is not a valid number', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'x', number: 5 }] })} />);
    await user.click(screen.getByText('5'));
    const input = screen.getByDisplayValue('5');
    await user.clear(input);
    await user.type(input, '12');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'list-1',
        expect.objectContaining({ items: [expect.objectContaining({ number: 12 })] })
      )
    );
  });

  it('edits the heading label', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [], laneLabel: 'Old Heading' })} />);
    await user.click(screen.getByText('Old Heading'));
    const input = screen.getByDisplayValue('Old Heading');
    await user.clear(input);
    await user.type(input, 'New Heading');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('list-1', expect.objectContaining({ laneLabel: 'New Heading' }))
    );
  });

  it('does not save the heading when it is unchanged', async () => {
    const user = userEvent.setup();
    render(<ListBlock block={makeBlock({ items: [], laneLabel: 'Same' })} />);
    await user.click(screen.getByText('Same'));
    await user.tab();
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});

describe('ListBlock: read-only mode', () => {
  it('hides per-item controls and the add-item form when not editable', () => {
    render(<ListBlock block={makeBlock({ items: [{ id: '1', text: 'x' }] }, { id: undefined })} />);
    expect(screen.queryByTitle('Remove item')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('+ Add item')).not.toBeInTheDocument();
  });
});
