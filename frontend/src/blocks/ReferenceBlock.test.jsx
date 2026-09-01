import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReferenceBlock from './ReferenceBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'ref-1', space_id: 'space-1', content, ...overrides };
}

function renderBlock(props) {
  return render(
    <MemoryRouter>
      <ReferenceBlock {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('ReferenceBlock: link', () => {
  it('links to the target Space, showing its title', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'target-1', targetSpaceTitle: 'Target Space' }) });
    expect(screen.getByRole('link', { name: 'Target Space' })).toHaveAttribute('href', '/spaces/target-1?from=space-1');
  });

  it('falls back to the raw target id when the title cannot be resolved', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'deleted-space', targetSpaceTitle: null }) });
    expect(screen.getByRole('link', { name: 'deleted-space' })).toBeInTheDocument();
  });

  it('omits ?from= when this block has no space_id of its own (e.g. a Tools-catalog demo)', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'target-1', targetSpaceTitle: 'Target' }, { space_id: undefined, id: undefined }) });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/spaces/target-1');
  });
});

describe('ReferenceBlock: note', () => {
  it('shows "(add a note)" when editable with no note yet', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'x', note: null }) });
    expect(screen.getByText('(add a note)')).toBeInTheDocument();
  });

  it('shows nothing inviting a note when not editable', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'x', note: null }, { id: undefined, space_id: undefined }) });
    expect(screen.queryByText('(add a note)')).not.toBeInTheDocument();
  });

  it('edits and saves a note', async () => {
    const user = userEvent.setup();
    const onBlocksChanged = vi.fn();
    renderBlock({ block: makeBlock({ target_space_id: 'x', note: null }), onBlocksChanged });

    await user.click(screen.getByText('(add a note)'));
    const input = screen.getByRole('textbox');
    await user.type(input, 'why this connects');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('ref-1', expect.objectContaining({ note: 'why this connects' }))
    );
    expect(onBlocksChanged).toHaveBeenCalled();
  });

  it('routes a note edit through onSave instead, for a Comparison side', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBlock({ block: makeBlock({ target_space_id: 'x', note: null }, { id: undefined }), onSave });

    await user.click(screen.getByText('(add a note)'));
    await user.type(screen.getByRole('textbox'), 'a note');
    await user.tab();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ note: 'a note' })));
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });

  it('does not save when the note is unchanged', async () => {
    const user = userEvent.setup();
    renderBlock({ block: makeBlock({ target_space_id: 'x', note: 'Existing' }) });
    await user.click(screen.getByText('— Existing'));
    await user.tab();
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});

describe('ReferenceBlock: source trust', () => {
  it('starts at "unrated" and cycles through high -> medium -> low -> unrated', async () => {
    const user = userEvent.setup();
    renderBlock({ block: makeBlock({ target_space_id: 'x' }) });
    expect(screen.getByText('[source trust: unrated]')).toBeInTheDocument();

    await user.click(screen.getByText('[source trust: unrated]'));
    await waitFor(() => expect(screen.getByText('[source trust: high]')).toBeInTheDocument());
    expect(api.updateBlockContent).toHaveBeenCalledWith('ref-1', expect.objectContaining({ trust: 'high' }));

    await user.click(screen.getByText('[source trust: high]'));
    await waitFor(() => expect(screen.getByText('[source trust: medium]')).toBeInTheDocument());

    await user.click(screen.getByText('[source trust: medium]'));
    await waitFor(() => expect(screen.getByText('[source trust: low]')).toBeInTheDocument());

    await user.click(screen.getByText('[source trust: low]'));
    await waitFor(() => expect(screen.getByText('[source trust: unrated]')).toBeInTheDocument());
  });

  it('hides the trust toggle entirely when not editable', () => {
    renderBlock({ block: makeBlock({ target_space_id: 'x' }, { id: undefined, space_id: undefined }) });
    expect(screen.queryByText(/source trust/)).not.toBeInTheDocument();
  });
});
