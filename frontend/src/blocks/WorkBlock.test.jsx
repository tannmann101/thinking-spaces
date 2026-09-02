import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkBlock from './WorkBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'work-1', space_id: 'space-1', content, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getBlocksForSpace.mockResolvedValue([]);
  api.updateBlockContent.mockResolvedValue({});
  // Cross-Space candidates for the "Link a claim" picker -- empty by
  // default, overridden per test where cross-Space linking is exercised.
  api.getWorkItems.mockResolvedValue([]);
  api.getSkeletonClaims.mockResolvedValue([]);
  api.getBlock.mockResolvedValue(null);
});

describe('WorkBlock: statement', () => {
  it('shows a placeholder using statementLabel when there is no statement yet', () => {
    render(<WorkBlock block={makeBlock({ support: [], confidence: 'tentative' })} statementLabel="Assessment" supportLabel="Rationale" />);
    expect(screen.getByText('(add the assessment)')).toBeInTheDocument();
  });

  it('edits and saves the statement via updateBlockContent', async () => {
    const user = userEvent.setup();
    const onBlocksChanged = vi.fn();
    render(
      <WorkBlock
        block={makeBlock({ statement: 'Old statement', support: [], confidence: 'tentative' })}
        statementLabel="Assessment"
        supportLabel="Rationale"
        onBlocksChanged={onBlocksChanged}
      />
    );
    await user.click(screen.getByText('Old statement'));
    const input = screen.getByDisplayValue('Old statement');
    await user.clear(input);
    await user.type(input, 'New statement');
    await user.tab(); // blur

    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('work-1', expect.objectContaining({ statement: 'New statement' })));
    expect(onBlocksChanged).toHaveBeenCalled();
  });

  it('is not editable when the block has no id and no onSave override', async () => {
    const user = userEvent.setup();
    render(<WorkBlock block={makeBlock({ statement: 'Demo statement', support: [], confidence: 'tentative' }, { id: undefined })} statementLabel="Assessment" supportLabel="Rationale" />);
    await user.click(screen.getByText('Demo statement'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('routes a statement edit through onSave instead, for an id-less interactive demo', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkBlock
        block={makeBlock({ statement: 'Demo statement', support: [], confidence: 'tentative' }, { id: undefined })}
        statementLabel="Assessment"
        supportLabel="Rationale"
        onSave={onSave}
      />
    );
    await user.click(screen.getByText('Demo statement'));
    const input = screen.getByDisplayValue('Demo statement');
    await user.clear(input);
    await user.type(input, 'Edited in the demo');
    await user.tab();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ statement: 'Edited in the demo' })));
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });

  it('does not fetch other Space blocks when there is no real id to fetch against', () => {
    render(
      <WorkBlock
        block={makeBlock({ statement: 'x', support: [], confidence: 'tentative' }, { id: undefined, space_id: undefined })}
        statementLabel="Assessment"
        supportLabel="Rationale"
        onSave={vi.fn()}
      />
    );
    expect(api.getBlocksForSpace).not.toHaveBeenCalled();
  });
});

describe('WorkBlock: confidence', () => {
  it('defaults to tentative when unset', () => {
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);
    expect(screen.getByText('tentative')).toBeInTheDocument();
  });

  it('cycles through the confidence levels in order on click', async () => {
    const user = userEvent.setup();
    render(<WorkBlock block={makeBlock({ support: [], confidence: 'questioned' })} statementLabel="Assessment" supportLabel="Rationale" />);
    await user.click(screen.getByText('questioned'));
    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('work-1', expect.objectContaining({ confidence: 'tentative' })));
  });

  it('wraps from certain back to questioned', async () => {
    const user = userEvent.setup();
    render(<WorkBlock block={makeBlock({ support: [], confidence: 'certain' })} statementLabel="Assessment" supportLabel="Rationale" />);
    await user.click(screen.getByText('certain'));
    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('work-1', expect.objectContaining({ confidence: 'questioned' })));
  });
});

describe('WorkBlock: support points', () => {
  it('shows "(nothing added yet)" for an empty support list', () => {
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);
    expect(screen.getByText('(nothing added yet)')).toBeInTheDocument();
  });

  it('adds a free-text support point', async () => {
    const user = userEvent.setup();
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);
    await user.type(screen.getByPlaceholderText('+ Add a point'), 'A new point');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({ support: [expect.objectContaining({ text: 'A new point' })] })
      )
    );
  });

  it('disables Add until there is real text typed', () => {
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removes a support point', async () => {
    const user = userEvent.setup();
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', text: 'Removable point' }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    await user.click(screen.getByTitle('Remove'));
    await waitFor(() => expect(api.updateBlockContent).toHaveBeenCalledWith('work-1', expect.objectContaining({ support: [] })));
  });

  it('edits an existing free-text support point\'s own text', async () => {
    const user = userEvent.setup();
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', text: 'Original point' }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    await user.click(screen.getByText('Original point'));
    const input = screen.getByDisplayValue('Original point');
    await user.clear(input);
    await user.type(input, 'Revised point');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({ support: [expect.objectContaining({ id: 'sp-1', text: 'Revised point' })] })
      )
    );
  });
});

describe('WorkBlock: linked support points', () => {
  it('resolves a pointer at a whole Work block\'s own statement', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'other-block', type: 'assessment', content: { statement: 'The linked claim' }, properties: {} },
    ]);
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', pointer: { blockId: 'other-block', itemId: null } }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    expect(await screen.findByText('The linked claim')).toBeInTheDocument();
  });

  it('resolves a pointer at a specific Skeleton lane item', async () => {
    api.getBlocksForSpace.mockResolvedValue([
      {
        id: 'lane-block',
        type: 'list',
        content: { laneLabel: 'Premises', items: [{ id: 'item-1', text: 'A premise' }] },
        properties: { skeletonLane: 'premises' },
      },
    ]);
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', pointer: { blockId: 'lane-block', itemId: 'item-1' } }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    expect(await screen.findByText('A premise')).toBeInTheDocument();
  });

  it('shows "(linked claim removed)" when the pointer target no longer exists', async () => {
    api.getBlocksForSpace.mockResolvedValue([]);
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', pointer: { blockId: 'gone', itemId: null } }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    expect(await screen.findByText('(linked claim removed)')).toBeInTheDocument();
  });

  it('opens the linker, offering other Work blocks and claim-lane items as candidates', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'other', type: 'question', content: { statement: 'An open question' }, properties: {} },
    ]);
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);

    await user.click(screen.getByRole('button', { name: /Link a claim/ }));
    expect(await screen.findByText('An open question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'An open question' }));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({
          support: [expect.objectContaining({ pointer: { blockId: 'other', itemId: null } })],
        })
      )
    );
  });

  it('excludes this same block from its own link candidates', async () => {
    const user = userEvent.setup();
    api.getBlocksForSpace.mockResolvedValue([
      { id: 'work-1', type: 'assessment', content: { statement: 'Its own statement' }, properties: {} },
    ]);
    render(<WorkBlock block={makeBlock({ support: [], statement: 'Its own statement' })} statementLabel="Assessment" supportLabel="Rationale" />);

    await user.click(screen.getByRole('button', { name: /Link a claim/ }));
    await waitFor(() => expect(api.getBlocksForSpace).toHaveBeenCalled());
    expect(screen.getByText(/Nothing to link to yet/)).toBeInTheDocument();
  });
});

describe('WorkBlock: cross-Space linked support points', () => {
  it('offers a cross-Space Work item and Skeleton claim, grouped under the other Space\'s title', async () => {
    const user = userEvent.setup();
    api.getWorkItems.mockResolvedValue([
      { id: 'other-space-work', type: 'hypothesis', content: { statement: 'A hypothesis elsewhere' }, space_id: 'space-2', space_title: 'Other Space' },
    ]);
    api.getSkeletonClaims.mockResolvedValue([
      { spaceId: 'space-2', spaceTitle: 'Other Space', blockId: 'other-lane', itemId: 'item-9', text: 'Evidence elsewhere', laneLabel: 'Evidence' },
    ]);
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);

    await user.click(screen.getByRole('button', { name: /Link a claim/ }));
    expect(await screen.findByText('A hypothesis elsewhere')).toBeInTheDocument();
    expect(screen.getByText('Evidence elsewhere')).toBeInTheDocument();
    expect(screen.getByText('Other Space')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A hypothesis elsewhere' }));
    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({
          support: [expect.objectContaining({ pointer: { spaceId: 'space-2', blockId: 'other-space-work', itemId: null } })],
        })
      )
    );
  });

  it('excludes a Work item already offered as a same-Space candidate from the cross-Space list', async () => {
    api.getWorkItems.mockResolvedValue([
      { id: 'own-block', type: 'assessment', content: { statement: 'Same-space item' }, space_id: 'space-1', space_title: 'This one' },
    ]);
    render(<WorkBlock block={makeBlock({ support: [] })} statementLabel="Assessment" supportLabel="Rationale" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Link a claim/ }));
    await waitFor(() => expect(api.getWorkItems).toHaveBeenCalled());
    // Same-space candidates come from spaceBlocks (empty here), and the
    // cross-Space list explicitly filters out its own Space's items --
    // so this candidate should never appear at all.
    expect(screen.queryByText('Same-space item')).not.toBeInTheDocument();
  });

  it('resolves a cross-Space pointer by fetching that specific block live', async () => {
    api.getBlock.mockResolvedValue({
      id: 'far-block',
      space_id: 'space-2',
      spaceTitle: 'Far Space',
      content: { statement: 'A claim from far away' },
    });
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', pointer: { spaceId: 'space-2', blockId: 'far-block', itemId: null } }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    expect(await screen.findByText('A claim from far away')).toBeInTheDocument();
    expect(screen.getByText('(in Far Space)')).toBeInTheDocument();
    expect(api.getBlock).toHaveBeenCalledWith('far-block');
  });

  it('shows "(linked claim removed)" when a cross-Space pointer\'s target block is gone', async () => {
    api.getBlock.mockRejectedValue(new Error('Entry not found'));
    render(
      <WorkBlock
        block={makeBlock({ support: [{ id: 'sp-1', pointer: { spaceId: 'space-2', blockId: 'gone', itemId: null } }] })}
        statementLabel="Assessment"
        supportLabel="Rationale"
      />
    );
    expect(await screen.findByText('(linked claim removed)')).toBeInTheDocument();
  });
});
