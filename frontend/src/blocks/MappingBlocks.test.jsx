// Component tests for the three Mapping Tools. Kept in one file because
// they share a shape (a headline plus ordered rows) and a save path, so
// the interesting assertions sit side by side rather than in three files
// repeating the same setup.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WordEvolutionBlock from './WordEvolutionBlock.jsx';
import ConceptMapBlock from './ConceptMapBlock.jsx';
import ModelBlock from './ModelBlock.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

beforeEach(() => {
  vi.resetAllMocks();
  api.updateBlockContent.mockResolvedValue({});
});

describe('WordEvolutionBlock', () => {
  const block = {
    id: 'we-1',
    content: {
      term: 'virtue',
      senses: [
        { id: 's1', period: 'Latin', sense: 'Manliness', note: '' },
        { id: 's2', period: 'Modern', sense: 'Conventional goodness', note: '' },
      ],
    },
  };

  it('renders the term and each sense-shift in its recorded order', () => {
    render(<WordEvolutionBlock block={block} />);
    expect(screen.getByText('virtue')).toBeInTheDocument();
    const steps = document.querySelectorAll('.word-evolution-step');
    expect(steps).toHaveLength(2);
    expect(steps[0].textContent).toContain('Latin');
    expect(steps[1].textContent).toContain('Modern');
  });

  it('adds a shift with its period and meaning', async () => {
    const user = userEvent.setup();
    render(<WordEvolutionBlock block={block} />);
    await user.type(screen.getByPlaceholderText(/^When/), 'Medieval');
    await user.type(screen.getByPlaceholderText('What it meant then'), 'Moral excellence');
    await user.click(screen.getByRole('button', { name: '+ Add a shift' }));

    await waitFor(() => {
      const [, content] = api.updateBlockContent.mock.calls[0];
      expect(content.senses).toHaveLength(3);
      expect(content.senses[2]).toMatchObject({ period: 'Medieval', sense: 'Moral excellence' });
    });
  });

  it('reorders a shift without touching the others', async () => {
    const user = userEvent.setup();
    render(<WordEvolutionBlock block={block} />);
    const secondStep = document.querySelectorAll('.word-evolution-step')[1];
    await user.click(within(secondStep).getByRole('button', { name: 'Move up' }));

    await waitFor(() => {
      const [, content] = api.updateBlockContent.mock.calls[0];
      expect(content.senses.map((s) => s.id)).toEqual(['s2', 's1']);
    });
  });

  it('explains itself rather than rendering blank when nothing is recorded', () => {
    render(<WordEvolutionBlock block={{ id: 'we-2', content: { term: '', senses: [] } }} />);
    expect(screen.getByText(/No sense-shifts recorded yet/)).toBeInTheDocument();
  });

  it('routes a save through onSave instead of the API when a parent overrides it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue();
    render(<WordEvolutionBlock block={{ content: { term: 'x', senses: [] } }} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('What it meant then'), 'a meaning');
    await user.click(screen.getByRole('button', { name: '+ Add a shift' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(api.updateBlockContent).not.toHaveBeenCalled();
  });
});

describe('ConceptMapBlock', () => {
  const block = {
    id: 'cm-1',
    content: {
      referent: 'Freedom',
      gloss: 'Acting according to what one is.',
      renderings: [
        { id: 'r1', label: 'No constraint', sense: 'Nobody stops me', alignment: 'partial', note: '' },
        { id: 'r2', label: 'Unlimited option', sense: 'Pick anything', alignment: 'divergent', note: '' },
      ],
    },
  };

  it('shows the referent and marks each rendering with its alignment', () => {
    render(<ConceptMapBlock block={block} />);
    expect(screen.getByText('Freedom')).toBeInTheDocument();
    const rows = document.querySelectorAll('.concept-map-rendering');
    expect(rows[0].getAttribute('data-alignment')).toBe('partial');
    expect(rows[1].getAttribute('data-alignment')).toBe('divergent');
  });

  it('counts the divergent renderings, since those are the misunderstanding', () => {
    render(<ConceptMapBlock block={block} />);
    expect(screen.getByText(/1 pointing elsewhere/)).toBeInTheDocument();
  });

  it('cycles a rendering through the three alignments', async () => {
    const user = userEvent.setup();
    render(<ConceptMapBlock block={block} />);
    // 'partial' is index 1, so one click lands on 'divergent'.
    await user.click(screen.getAllByRole('button', { name: 'Partial' })[0]);

    await waitFor(() => {
      const [, content] = api.updateBlockContent.mock.calls[0];
      expect(content.renderings[0].alignment).toBe('divergent');
    });
  });

  it('adds a rendering as partial by default, the honest starting judgement', async () => {
    const user = userEvent.setup();
    render(<ConceptMapBlock block={block} />);
    await user.type(screen.getByPlaceholderText('The word or phrase used'), 'Autonomy');
    await user.click(screen.getByRole('button', { name: '+ Add a rendering' }));

    await waitFor(() => {
      const [, content] = api.updateBlockContent.mock.calls[0];
      expect(content.renderings[2]).toMatchObject({ label: 'Autonomy', alignment: 'partial' });
    });
  });
});

describe('ModelBlock', () => {
  const block = {
    id: 'm-1',
    content: {
      subject: 'Meritocracy',
      components: [
        { id: 'c1', name: 'Effort', role: '' },
        { id: 'c2', name: 'Outcome', role: '' },
      ],
      relations: [{ id: 'rel1', from: 'c1', to: 'c2', kind: 'produces', note: '' }],
    },
  };

  it('resolves a relation to its components current names', () => {
    render(<ModelBlock block={block} />);
    const relation = document.querySelector('.model-relation');
    expect(relation.textContent).toContain('Effort');
    expect(relation.textContent).toContain('produces');
    expect(relation.textContent).toContain('Outcome');
  });

  it('follows a rename automatically, because relations store ids not names', async () => {
    const renamed = {
      ...block,
      content: {
        ...block.content,
        components: [
          { id: 'c1', name: 'Work put in', role: '' },
          { id: 'c2', name: 'Outcome', role: '' },
        ],
      },
    };
    render(<ModelBlock block={renamed} />);
    expect(document.querySelector('.model-relation').textContent).toContain('Work put in');
  });

  it('keeps a relation visible when its component is gone, rather than dropping it silently', () => {
    const orphaned = {
      ...block,
      content: { ...block.content, components: [{ id: 'c2', name: 'Outcome', role: '' }] },
    };
    render(<ModelBlock block={orphaned} />);
    expect(document.querySelector('.model-relation').textContent).toContain('(removed)');
  });

  it('adds a component', async () => {
    const user = userEvent.setup();
    render(<ModelBlock block={block} />);
    await user.type(screen.getByPlaceholderText('Add a component'), 'Desert');
    await user.click(screen.getByRole('button', { name: '+ Add component' }));

    await waitFor(() => {
      const [, content] = api.updateBlockContent.mock.calls[0];
      expect(content.components.map((c) => c.name)).toEqual(['Effort', 'Outcome', 'Desert']);
    });
  });

  it('offers no relation builder until there are two components to relate', () => {
    render(<ModelBlock block={{ id: 'm-2', content: { subject: 'x', components: [{ id: 'c1', name: 'One' }], relations: [] } }} />);
    expect(screen.queryByRole('button', { name: '+ Add relation' })).not.toBeInTheDocument();
    expect(screen.getByText(/Add a second component/)).toBeInTheDocument();
  });
});
