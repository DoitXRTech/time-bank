/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const baseProps = { title: 'Anular movimiento', message: 'Se revierte el saldo.', confirmLabel: 'Anular', onConfirm: jest.fn(), onCancel: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('ConfirmDialog', () => {
  it('confirms a plain yes/no without a reason', () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('keeps the confirm button disabled until the required reason is written, then sends it trimmed', () => {
    render(<ConfirmDialog {...baseProps} reasonLabel="Motivo" />);
    const confirm = screen.getByRole('button', { name: 'Anular' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: '   ' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: '  Duplicado  ' } });
    fireEvent.click(confirm);
    expect(baseProps.onConfirm).toHaveBeenCalledWith('Duplicado');
  });

  it('cancels with Escape and with the Cancel button, but not while busy', () => {
    const { rerender } = render(<ConfirmDialog {...baseProps} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(2);

    rerender(<ConfirmDialog {...baseProps} busy />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(baseProps.onCancel).toHaveBeenCalledTimes(2);
  });
});
