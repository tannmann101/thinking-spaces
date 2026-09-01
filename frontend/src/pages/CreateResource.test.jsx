import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateResource from './CreateResource.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateResource />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSpaces.mockResolvedValue([]);
  api.getResourceTemplateByType.mockResolvedValue(null);
});

describe('CreateResource: type tags', () => {
  it('adds a type via a suggestion button', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ book' }));
    expect(screen.getByText('book')).toBeInTheDocument();
    // Once chosen, that suggestion button disappears (it's already applied).
    expect(screen.queryByRole('button', { name: '+ book' })).not.toBeInTheDocument();
  });

  it('adds a type by typing and pressing Enter', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('+ type'), 'gadget{Enter}');
    expect(screen.getByText('gadget')).toBeInTheDocument();
  });

  it('never allows "resource" itself as a type tag', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('+ type'), 'resource{Enter}');
    expect(screen.queryByText('resource')).not.toBeInTheDocument();
  });

  it('removes a type tag', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ book' }));
    await user.click(screen.getByTitle('Remove'));
    expect(screen.queryByText('book')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ book' })).toBeInTheDocument();
  });
});

describe('CreateResource: Resource Templates', () => {
  it('replaces the generic facets with a matching template\'s own once its type is chosen', async () => {
    const user = userEvent.setup();
    api.getResourceTemplateByType.mockImplementation((type) =>
      Promise.resolve(
        type === 'book'
          ? { id: 'rt-book', type: 'book', label: 'Book', facets: [{ name: 'Core Argument', prompt: 'What is it arguing?' }] }
          : null
      )
    );
    renderPage();
    expect(screen.getByText('What It Is')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ book' }));
    expect(await screen.findByText(/template's own questions below/)).toBeInTheDocument();
    expect(screen.getByText('Book')).toBeInTheDocument();
    expect(screen.getByText('Core Argument')).toBeInTheDocument();
    expect(screen.getByText('What is it arguing?')).toBeInTheDocument();
    expect(screen.queryByText('What It Is')).not.toBeInTheDocument();
  });

  it('falls back to the generic facets once the matching type tag is removed', async () => {
    const user = userEvent.setup();
    api.getResourceTemplateByType.mockImplementation((type) =>
      Promise.resolve(
        type === 'book' ? { id: 'rt-book', type: 'book', label: 'Book', facets: [{ name: 'Core Argument', prompt: 'x' }] } : null
      )
    );
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ book' }));
    await screen.findByText('Core Argument');

    await user.click(screen.getByTitle('Remove'));
    await waitFor(() => expect(screen.getByText('What It Is')).toBeInTheDocument());
    expect(screen.queryByText('Core Argument')).not.toBeInTheDocument();
  });

  it('submits the template\'s own facet names as Categories, not the generic ones', async () => {
    const user = userEvent.setup();
    api.getResourceTemplateByType.mockImplementation((type) =>
      Promise.resolve(
        type === 'book' ? { id: 'rt-book', type: 'book', label: 'Book', facets: [{ name: 'Core Argument', prompt: 'x' }] } : null
      )
    );
    api.createSpace.mockResolvedValue({ id: 'new-id' });
    renderPage();
    await user.type(screen.getByPlaceholderText('What is this Resource called?'), 'My Book');
    await user.click(screen.getByRole('button', { name: '+ book' }));
    await screen.findByText('Core Argument');

    await user.click(screen.getByRole('button', { name: 'Create Resource' }));
    await waitFor(() => expect(api.createSpace).toHaveBeenCalled());
    const payload = api.createSpace.mock.calls[0][0];
    expect(payload.categories).toEqual(['Core Argument', 'Touches / Touched By']);
    expect(payload.extraBlocks.find((b) => b.properties?.categories?.[0] === 'Core Argument')).toBeTruthy();
  });
});

describe('CreateResource: touches / touched by', () => {
  it('shows "no other Spaces" when none exist', async () => {
    renderPage();
    expect(await screen.findByText('No other Spaces exist yet to relate this to.')).toBeInTheDocument();
  });

  it('selecting a Space reveals a note field for how it relates', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([{ id: 's1', title: 'Related Space' }]);
    renderPage();
    const checkbox = await screen.findByRole('checkbox');
    expect(screen.queryByPlaceholderText('how does it relate? (optional)')).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.getByPlaceholderText('how does it relate? (optional)')).toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.queryByPlaceholderText('how does it relate? (optional)')).not.toBeInTheDocument();
  });
});

describe('CreateResource: submitting', () => {
  it('disables submit until a title is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('button', { name: 'Create Resource' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What is this Resource called?'), 'My Book');
    expect(screen.getByRole('button', { name: 'Create Resource' })).toBeEnabled();
  });

  it('submits tagged "resource" plus any chosen type tags, origin "external", and the four starting Categories', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockResolvedValue([{ id: 's1', title: 'Related Space' }]);
    api.createSpace.mockResolvedValue({ id: 'new-resource-id' });
    renderPage();

    await user.type(screen.getByPlaceholderText('What is this Resource called?'), 'My Book');
    await user.click(screen.getByRole('button', { name: '+ book' }));
    // Three textareas (What It Is / Affords / Offers) share this
    // placeholder -- the first is "What It Is".
    await user.type(screen.getAllByPlaceholderText('(optional -- can be filled in later)')[0], 'A physical book');

    const checkbox = await screen.findByRole('checkbox');
    await user.click(checkbox);
    await user.type(screen.getByPlaceholderText('how does it relate? (optional)'), 'cited in it');

    await user.click(screen.getByRole('button', { name: 'Create Resource' }));

    await waitFor(() => expect(api.createSpace).toHaveBeenCalled());
    const payload = api.createSpace.mock.calls[0][0];
    expect(payload.title).toBe('My Book');
    expect(payload.tags).toEqual(['resource', 'book']);
    expect(payload.origin).toBe('external');
    expect(payload.categories).toEqual(['What It Is', 'What It Affords', 'What It Offers', 'Touches / Touched By']);
    expect(payload.extraBlocks.find((b) => b.type === 'reference')).toMatchObject({
      content: { target_space_id: 's1', note: 'cited in it' },
      properties: { categories: ['Touches / Touched By'] },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-resource-id');
  });

  it('shows an error and re-enables the form when creation fails', async () => {
    const user = userEvent.setup();
    api.createSpace.mockRejectedValue(new Error('Boom'));
    renderPage();
    await user.type(screen.getByPlaceholderText('What is this Resource called?'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create Resource' }));

    expect(await screen.findByText('Could not create Resource: Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Resource' })).toBeEnabled();
  });
});
