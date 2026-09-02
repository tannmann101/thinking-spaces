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

describe('MediaBlock: link', () => {
  it('renders a link card with the fetched preview fields', () => {
    render(
      <MediaBlock
        block={makeBlock({
          mediaType: 'link',
          url: 'https://example.com/article',
          caption: '',
          linkTitle: 'A Great Article',
          linkDescription: 'Some description.',
          linkImage: 'https://example.com/cover.jpg',
          linkSiteName: 'example.com',
        })}
      />
    );
    const link = screen.getByRole('link', { name: /A Great Article/ });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(screen.getByText('Some description.')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    // The link's own text already names the page, so the thumbnail is
    // decorative (alt="") -- that gives it an accessible role of
    // "presentation", not "img", hence the plain DOM query here.
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('falls back to the raw url as the title when no preview title was captured', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'link', url: 'https://example.com/x', caption: '' })} />);
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toBeInTheDocument();
  });
});

describe('MediaBlock: document', () => {
  it('renders a PDF inline preview plus a download link', () => {
    render(
      <MediaBlock
        block={makeBlock({
          mediaType: 'document',
          url: '/api/uploads/abc.pdf',
          caption: '',
          fileName: 'Notes.pdf',
          fileType: 'application/pdf',
        })}
      />
    );
    expect(document.querySelector('iframe')).toHaveAttribute('src', '/api/uploads/abc.pdf');
    expect(screen.getByRole('link', { name: /Download Notes.pdf/ })).toBeInTheDocument();
  });

  it('shows a download-only placeholder for a file type with no inline preview', () => {
    render(
      <MediaBlock
        block={makeBlock({
          mediaType: 'document',
          url: '/api/uploads/abc.docx',
          caption: '',
          fileName: 'Notes.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })}
      />
    );
    expect(screen.getByText(/no inline preview for this file type/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Notes.docx/ })).toBeInTheDocument();
  });

  it('shows a placeholder when no file has been uploaded yet', () => {
    render(<MediaBlock block={makeBlock({ mediaType: 'document', url: '', caption: '' })} />);
    expect(screen.getByText('No file uploaded yet')).toBeInTheDocument();
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
