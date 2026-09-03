import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SynthesesPage from './SynthesesPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const renderPage = () => render(<MemoryRouter><SynthesesPage /></MemoryRouter>);

function synthesis(overrides = {}) {
  return {
    id: 'syn1',
    title: 'On Feedback',
    tags: ['synthesis', 'essay'],
    kinds: ['essay'],
    promoted: false,
    drawnFrom: [],
    sourceSpaceCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSynthesesIndex.mockResolvedValue([]);
});

describe('SynthesesPage', () => {
  it('points at the creation flow when there are none', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Compile one' })).toHaveAttribute('href', '/synthesis/new');
  });

  it('shows the kind, and says so plainly when none is set', async () => {
    api.getSynthesesIndex.mockResolvedValue([synthesis(), synthesis({ id: 'syn2', title: 'Untyped', kinds: [] })]);
    renderPage();
    expect(await screen.findByText(/^essay/)).toBeInTheDocument();
    expect(screen.getByText(/no kind set/)).toBeInTheDocument();
  });

  it('lists the lineage, linking each claim to the entry it came from', async () => {
    api.getSynthesesIndex.mockResolvedValue([
      synthesis({
        drawnFrom: [
          { blockId: 'b1', type: 'assessment', statement: 'A claim', spaceId: 's1', spaceTitle: 'Source' },
        ],
        sourceSpaceCount: 1,
      }),
    ]);
    renderPage();
    const link = await screen.findByRole('link', { name: 'Assessment' });
    expect(link).toHaveAttribute('href', '/spaces/s1?highlight=b1');
    expect(screen.getByText('A claim')).toBeInTheDocument();
    expect(screen.getByText('in Source')).toBeInTheDocument();
  });

  it('counts the claims and the Spaces they came from', async () => {
    api.getSynthesesIndex.mockResolvedValue([
      synthesis({
        drawnFrom: [
          { blockId: 'b1', type: 'assessment', statement: 'One', spaceId: 's1', spaceTitle: 'A' },
          { blockId: 'b2', type: 'question', statement: 'Two', spaceId: 's2', spaceTitle: 'B' },
        ],
        sourceSpaceCount: 2,
      }),
    ]);
    renderPage();
    expect(await screen.findByText(/2 claims from 2 Spaces/)).toBeInTheDocument();
  });

  it('says a Synthesis has no recorded sources rather than leaving it blank', async () => {
    api.getSynthesesIndex.mockResolvedValue([synthesis()]);
    renderPage();
    expect(await screen.findByText('No recorded sources.')).toBeInTheDocument();
  });

  it('marks and counts the ones promoted to Resource', async () => {
    api.getSynthesesIndex.mockResolvedValue([synthesis({ promoted: true })]);
    renderPage();
    expect(await screen.findByText('↑ Resource')).toBeInTheDocument();
    expect(screen.getByText(/1 promoted to Resource/)).toBeInTheDocument();
  });

  it('surfaces a failure rather than an empty page', async () => {
    api.getSynthesesIndex.mockRejectedValue(new Error('Nope'));
    renderPage();
    expect(await screen.findByText('Could not load Syntheses: Nope')).toBeInTheDocument();
  });
});
