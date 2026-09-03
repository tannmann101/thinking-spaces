import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResourcesPage from './ResourcesPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const renderPage = () => render(<MemoryRouter><ResourcesPage /></MemoryRouter>);

function resource(overrides = {}) {
  return {
    id: 'r1',
    title: 'Thinking in Systems',
    tags: ['resource', 'book'],
    typeTags: ['book'],
    categories: [],
    origin: 'external',
    referencedBy: [],
    referenceCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getResourcesIndex.mockResolvedValue([]);
});

describe('ResourcesPage', () => {
  it('points at the creation flow when there are none', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Add one' })).toHaveAttribute('href', '/resources/new');
  });

  it('groups Resources under their type', async () => {
    api.getResourcesIndex.mockResolvedValue([resource(), resource({ id: 'r2', title: 'A Lens', typeTags: ['lens'] })]);
    renderPage();
    expect(await screen.findByRole('heading', { name: /^Book/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Lens/ })).toBeInTheDocument();
  });

  it('files a Resource with no type under Untyped rather than hiding it', async () => {
    api.getResourcesIndex.mockResolvedValue([resource({ typeTags: [] })]);
    renderPage();
    expect(await screen.findByRole('heading', { name: /^Untyped/ })).toBeInTheDocument();
  });

  it('shows a Resource under every type it carries, since types are not exclusive', async () => {
    api.getResourcesIndex.mockResolvedValue([resource({ typeTags: ['book', 'lens'] })]);
    renderPage();
    await screen.findByRole('heading', { name: /^Book/ });
    expect(screen.getAllByRole('link', { name: 'Thinking in Systems' })).toHaveLength(2);
  });

  it('calls out a Resource nothing references -- the reading this page exists for', async () => {
    api.getResourcesIndex.mockResolvedValue([resource()]);
    renderPage();
    expect(await screen.findByText('Not referenced anywhere yet.')).toBeInTheDocument();
    expect(screen.getByText(/1 not referenced anywhere yet/)).toBeInTheDocument();
  });

  it('names the Spaces that use a Resource, each linking through', async () => {
    api.getResourcesIndex.mockResolvedValue([
      resource({ referenceCount: 1, referencedBy: [{ spaceId: 's1', spaceTitle: 'Using Space' }] }),
    ]);
    renderPage();
    await waitFor(() => expect(document.querySelector('.resource-card')).toBeTruthy());
    const card = document.querySelector('.resource-card');
    expect(within(card).getByText(/Used in/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Using Space' })).toHaveAttribute('href', '/spaces/s1');
  });

  it('marks a promoted Synthesis so it does not read as something sourced from outside', async () => {
    api.getResourcesIndex.mockResolvedValue([resource({ origin: 'internal' })]);
    renderPage();
    expect(await screen.findByText('Internal')).toBeInTheDocument();
  });

  it('surfaces a failure rather than an empty page', async () => {
    api.getResourcesIndex.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Could not load Resources: Nope')).toBeInTheDocument();
  });
});
