import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialogProvider, useConfirmDialog } from './ConfirmDialog.jsx';

function ConfirmHarness() {
  const { confirm } = useConfirmDialog();
  const [result, setResult] = useState(null);
  return (
    <div>
      <button type="button" onClick={async () => setResult(await confirm('Delete this Template?'))}>
        Trigger
      </button>
      <p>Result: {result === null ? '(none yet)' : String(result)}</p>
    </div>
  );
}

function PromptHarness() {
  const { promptToMatch } = useConfirmDialog();
  const [result, setResult] = useState(null);
  return (
    <div>
      <button type="button" onClick={async () => setResult(await promptToMatch('Delete "My Space"?', 'My Space'))}>
        Trigger
      </button>
      <p>Result: {result === null ? '(none yet)' : String(result)}</p>
    </div>
  );
}

describe('ConfirmDialog: confirm()', () => {
  it('shows the given message and resolves true on Confirm', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <ConfirmHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByText('Delete this Template?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Result: true')).toBeInTheDocument();
    expect(screen.queryByText('Delete this Template?')).not.toBeInTheDocument();
  });

  it('resolves false on Cancel', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <ConfirmHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Result: false')).toBeInTheDocument();
  });

  it('resolves false when clicking the overlay outside the dialog', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmDialogProvider>
        <ConfirmHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(container.querySelector('.confirm-overlay'));
    expect(await screen.findByText('Result: false')).toBeInTheDocument();
  });

  it('clicking inside the dialog itself does not close it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmDialogProvider>
        <ConfirmHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(container.querySelector('.confirm-dialog'));
    expect(screen.getByText('Delete this Template?')).toBeInTheDocument();
  });
});

describe('ConfirmDialog: promptToMatch()', () => {
  it('disables the Delete button until the typed text matches exactly', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <PromptHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Type "My Space" to confirm'), 'wrong text');
    expect(deleteButton).toBeDisabled();

    await user.clear(screen.getByPlaceholderText('Type "My Space" to confirm'));
    await user.type(screen.getByPlaceholderText('Type "My Space" to confirm'), 'My Space');
    expect(deleteButton).toBeEnabled();
  });

  it('resolves true once the exact text is typed and Delete is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <PromptHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.type(screen.getByPlaceholderText('Type "My Space" to confirm'), 'My Space');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Result: true')).toBeInTheDocument();
  });

  it('starts with an empty draft each time, not carrying over a previous attempt', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <PromptHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.type(screen.getByPlaceholderText('Type "My Space" to confirm'), 'My Space');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByText('Result: true');

    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByPlaceholderText('Type "My Space" to confirm')).toHaveValue('');
  });

  it('pressing Enter confirms only once the text matches', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <PromptHarness />
      </ConfirmDialogProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    const input = screen.getByPlaceholderText('Type "My Space" to confirm');

    await user.type(input, 'not quite{Enter}');
    expect(screen.getByText('Delete "My Space"?')).toBeInTheDocument(); // still open

    await user.clear(input);
    await user.type(input, 'My Space{Enter}');
    expect(await screen.findByText('Result: true')).toBeInTheDocument();
  });
});

describe('useConfirmDialog', () => {
  it('throws when used outside a ConfirmDialogProvider', () => {
    // Swallow the expected React error-boundary console noise for this
    // one deliberately-invalid-usage test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useConfirmDialog();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useConfirmDialog must be used within a ConfirmDialogProvider');
    spy.mockRestore();
  });
});
