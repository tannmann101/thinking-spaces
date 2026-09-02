import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DocumentPreview from './mediaDocument.jsx';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentPreview: text-like files', () => {
  it('fetches and renders the raw text of a Markdown/.txt file', async () => {
    fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('# Hello\n\nSome notes.') });
    render(<DocumentPreview url="/api/uploads/notes.md" fileName="notes.md" fileType="text/markdown" />);
    // RTL's getByText normalizes whitespace (collapsing the newlines),
    // so a real newline-preserving <pre> needs a raw textContent check.
    await screen.findByText(/Hello/);
    expect(document.querySelector('.media-document-text').textContent).toBe('# Hello\n\nSome notes.');
    expect(fetch).toHaveBeenCalledWith('/api/uploads/notes.md');
  });

  it('shows an error message when the text fetch fails', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') });
    render(<DocumentPreview url="/api/uploads/missing.txt" fileName="missing.txt" fileType="text/plain" />);
    expect(await screen.findByText(/Could not load this file's text/)).toBeInTheDocument();
  });
});

describe('DocumentPreview: PDF', () => {
  it('renders an iframe pointed at the file url', () => {
    render(<DocumentPreview url="/api/uploads/report.pdf" fileName="report.pdf" fileType="application/pdf" />);
    expect(document.querySelector('iframe')).toHaveAttribute('src', '/api/uploads/report.pdf');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('DocumentPreview: other file types', () => {
  it('shows a download-only message, no inline preview attempted', () => {
    render(
      <DocumentPreview
        url="/api/uploads/deck.pptx"
        fileName="deck.pptx"
        fileType="application/vnd.openxmlformats-officedocument.presentationml.presentation"
      />
    );
    expect(screen.getByText(/no inline preview for this file type/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a placeholder when there is no url at all', () => {
    render(<DocumentPreview url="" fileName="" fileType="" />);
    expect(screen.getByText('No file uploaded yet')).toBeInTheDocument();
  });
});
