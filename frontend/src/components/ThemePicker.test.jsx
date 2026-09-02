import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemePicker from './ThemePicker.jsx';
import { defaultBlockTheme } from '../theme/itemTheme.js';

function renderPicker({ item, kind = 'block', onSave = vi.fn() } = {}) {
  render(<ThemePicker item={item} kind={kind} onSave={onSave} />);
  return onSave;
}

const plainBlock = { id: 'b1', type: 'assessment', properties: {} };

describe('ThemePicker', () => {
  it('starts collapsed behind a single toggle, so it never crowds the item itself', () => {
    renderPicker({ item: plainBlock });
    expect(screen.getByRole('button', { name: /Theme/ })).toBeInTheDocument();
    expect(screen.queryByText('Shape')).not.toBeInTheDocument();
  });

  it('opens to show all four dimensions', async () => {
    const user = userEvent.setup();
    renderPicker({ item: plainBlock });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    ['Color', 'Shape', 'Density', 'Type'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('marks the resolved value as active, even when it came from the default rather than an override', async () => {
    const user = userEvent.setup();
    renderPicker({ item: plainBlock });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    const defaultShape = defaultBlockTheme('assessment').shape;
    expect(screen.getByRole('button', { name: defaultShape })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves only the changed dimension, merged onto any existing override', async () => {
    const user = userEvent.setup();
    const onSave = renderPicker({
      item: { ...plainBlock, properties: { theme: { accent: 'teal' } } },
    });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    await user.click(screen.getByRole('button', { name: 'roomy' }));
    expect(onSave).toHaveBeenCalledWith({ accent: 'teal', density: 'roomy' });
  });

  it('offers Reset only when there is an override to clear, and clears it with null', async () => {
    const user = userEvent.setup();
    const onSave = renderPicker({ item: { ...plainBlock, properties: { theme: { accent: 'teal' } } } });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('hides Reset for an item still on its default look', async () => {
    const user = userEvent.setup();
    renderPicker({ item: plainBlock });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();
  });

  it('reads a Space\'s override from its own theme field rather than properties', async () => {
    const user = userEvent.setup();
    const onSave = renderPicker({ item: { id: 's1', tags: [], theme: { shape: 'notch' } }, kind: 'space' });
    await user.click(screen.getByRole('button', { name: /Theme/ }));
    expect(screen.getByRole('button', { name: 'notch' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'mono' }));
    expect(onSave).toHaveBeenCalledWith({ shape: 'notch', typeface: 'mono' });
  });
});
