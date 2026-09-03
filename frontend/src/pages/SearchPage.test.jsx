import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SearchPage from './SearchPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage(path = '/search?q=territory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.searchEverything.mockResolvedValue({ query: 'territory', spaces: [], blocks: [], total: 0 });
});

describe('SearchPage', () => {
  it('asks for the query in the URL, so a result page is shareable and reloadable', async () => {
    renderPage('/search?q=feedback');
    await waitFor(() => expect(api.searchEverything).toHaveBeenCalledWith('feedback'));
  });

  it('prompts rather than searching when there is no query', () => {
    renderPage('/search');
    expect(screen.getByText(/Type something into the search box/)).toBeInTheDocument();
    expect(api.searchEverything).not.toHaveBeenCalled();
  });

  it('says plainly when nothing matches', async () => {
    renderPage();
    expect(await screen.findByText(/Nothing matches “territory”/)).toBeInTheDocument();
  });

  it('links an entry result straight to the entry, not just its Space', async () => {
    api.searchEverything.mockResolvedValue({
      query: 'territory',
      spaces: [],
      blocks: [
        { blockId: 'b1', spaceId: 's1', spaceTitle: 'A Space', type: 'text', excerpt: 'the territory' },
      ],
      total: 1,
    });
    renderPage();
    const link = await screen.findByRole('link', { name: /Writing/ });
    expect(link).toHaveAttribute('href', '/spaces/s1?highlight=b1');
  });

  it('shows the excerpt and which Space the entry is in', async () => {
    api.searchEverything.mockResolvedValue({
      query: 'territory',
      spaces: [],
      blocks: [
        { blockId: 'b1', spaceId: 's1', spaceTitle: 'A Space', type: 'text', excerpt: 'the map is not the territory' },
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText('the map is not the territory')).toBeInTheDocument();
    expect(screen.getByText('in A Space')).toBeInTheDocument();
  });

  it('lists Space matches separately from entry matches', async () => {
    api.searchEverything.mockResolvedValue({
      query: 'territory',
      spaces: [{ id: 's1', title: 'Territory Notes', status: 'active', goal: null }],
      blocks: [{ blockId: 'b1', spaceId: 's2', spaceTitle: 'Other', type: 'text', excerpt: 'x' }],
      total: 2,
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Spaces (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entries (1)' })).toBeInTheDocument();
    expect(screen.getByText('2 matches for “territory”.')).toBeInTheDocument();
  });

  it('surfaces a failure rather than spinning forever', async () => {
    api.searchEverything.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Search failed: Nope')).toBeInTheDocument();
  });
});
