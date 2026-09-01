import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaBlock from './MediaBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function makeBlock(content, overrides = {}) {
  return { id: 'media-1', content, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('MediaBlock: image', () => {
  it('renders an <img> with the given url and caption as alt text', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'image', url: 'https://example.com/x.png', caption: 'A photo' })} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/x.png');
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'A photo');
  });

  it('shows "(add a caption)" when editable with none set', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'image', url: 'x.png', caption: '' })} />);
    expect(screen.getByText('(add a caption)')).toBeInTheDocument();
  });

  it('edits and saves the caption', async () => {
    const user = userEvent.setup();
    const onBlocksChanged = vi.fn();
    render(<MediaBlock block={makeBlock({ mediaType: 'image', url: 'x.png', caption: '' })} onBlocksChanged={onBlocksChanged} />);

    await user.click(screen.getByText('(add a caption)'));
    await user.type(screen.getByRole('textbox'), 'New caption');
    await user.tab();

    await waitFor(() =>
      expect(api.updateBlockContent).toHaveBeenCalledWith('media-1', expect.objectContaining({ caption: 'New caption' }))
    );
    expect(onBlocksChanged).toHaveBeenCalled();
  });

  it('does not save when the caption is unchanged', async () => {
    const user = userEvent.setup();
    render(<MediaBlock block={makeBlock({ mediaType: 'image', url: 'x.png', caption: 'Same' })} />);
    await user.click(screen.getByText('Same'));
    await user.tab();
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });

  it('shows no caption placeholder when not editable', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'image', url: 'x.png', caption: '' }, { id: undefined })} />);
    expect(screen.queryByText('(add a caption)')).not.toBeInTheDocument();
  });

  it('routes a caption edit through onSave instead, for an id-less demo/Comparison side', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MediaBlock
        block={makeBlock({ mediaType: 'image', url: 'x.png', caption: '' }, { id: undefined })}
        onSave={onSave}
      />
    );
    await user.click(screen.getByText('(add a caption)'));
    await user.type(screen.getByRole('textbox'), 'Demo caption');
    await user.tab();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ caption: 'Demo caption' })));
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});

describe('MediaBlock: unimplemented media types', () => {
  it('shows a placeholder for audio', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'audio', caption: '' })} />);
    expect(screen.getByText('Audio — playback not implemented yet')).toBeInTheDocument();
  });

  it('shows a placeholder for sketch', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'sketch', caption: '' })} />);
    expect(screen.getByText('Sketch embed — not implemented yet')).toBeInTheDocument();
  });

  it('shows an explicit message for a genuinely unknown media type', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'video', caption: '' })} />);
    expect(screen.getByText('Unknown media type: video')).toBeInTheDocument();
  });
});
