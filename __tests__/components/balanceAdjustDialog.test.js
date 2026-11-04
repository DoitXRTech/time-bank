/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BalanceAdjustDialog } from '@/components/admin/BalanceAdjustDialog';
import { SummaryTable } from '@/components/admin/SummaryTable';
import { apiPost } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ apiPost: jest.fn() }));

const employee = { id: 'e1', name: 'Kevin Sequeira', active: true, balances: { overtime: 132, vacation: 16, holiday: 1, birthday: 0 } };

const field = (name) => screen.getByLabelText(new RegExp(`^${name}`));
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const write = (value) => fireEvent.change(screen.getByLabelText(/Qué se hizo y por qué/), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Guardar ajuste' });
const clickSave = () =>
  act(async () => {
    fireEvent.click(save());
  });

beforeEach(() => {
  jest.clearAllMocks();
  apiPost.mockResolvedValue({ employee });
});

describe('BalanceAdjustDialog', () => {
  const open = (props = {}) => render(<BalanceAdjustDialog employee={employee} onSaved={jest.fn()} onCancel={jest.fn()} {...props} />);

  it('starts with the current balances, shows each one, and cannot be saved yet', () => {
    open();

    expect(field('Horas extra').value).toBe('132');
    expect(field('Vacaciones').value).toBe('16');
    expect(screen.getByText('Ahora: +132 h')).toBeTruthy();
    expect(screen.getByText('Todavía no cambió ningún saldo.')).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('previews what will be registered as the person types', () => {
    open();

    type('Horas extra', '100');
    type('Feriados por canjear', '0');

    expect(screen.getByText('Horas extra: −32 h (de +132 h a +100 h)')).toBeTruthy();
    expect(screen.getByText('Feriados por canjear: −1 d (de +1 d a 0 d)')).toBeTruthy();
  });

  it('needs both a change and the note before it can be saved', () => {
    open();

    type('Horas extra', '100');
    expect(save().disabled).toBe(true);

    write('   ');
    expect(save().disabled).toBe(true);

    write('El Excel contó mal 2025');
    expect(save().disabled).toBe(false);

    type('Horas extra', '132');
    expect(save().disabled).toBe(true);
  });

  it('sends the balances as typed with the note, then reports it saved', async () => {
    const onSaved = jest.fn();
    open({ onSaved });
    type('Horas extra', '100');
    write(' El Excel contó mal 2025 ');

    await clickSave();

    expect(apiPost).toHaveBeenCalledWith('/api/employees/e1/balances', {
      balances: { overtime: '100', vacation: '16', holiday: '1', birthday: '0' },
      note: ' El Excel contó mal 2025 ',
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows the error and keeps what was typed when the server refuses', async () => {
    apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'CONFLICT', metadata: { reason: 'EMPLOYEE_INACTIVE' } }));
    const onSaved = jest.fn();
    open({ onSaved });
    type('Horas extra', '100');
    write('Prueba');

    await clickSave();

    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('inactivo');
    expect(field('Horas extra').value).toBe('100');
    expect(screen.getByLabelText(/Qué se hizo y por qué/).value).toBe('Prueba');
  });
});

describe('SummaryTable: the "Ajustar" button', () => {
  const inactive = { ...employee, id: 'e2', name: 'Luis Antiguo', active: false };

  it('opens the dialog for that person, and reloads the data once the adjustment is saved', async () => {
    const onChanged = jest.fn();
    render(<SummaryTable employees={[employee, inactive]} loading={false} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldos de Kevin Sequeira' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Ajustar saldos de Kevin Sequeira')).toBeTruthy();

    type('Horas extra', '100');
    write('Reinicio');
    await clickSave();

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cannot be used on an inactive person (they take no movements)', () => {
    render(<SummaryTable employees={[employee, inactive]} loading={false} onChanged={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Ajustar saldos de Luis Antiguo' }).disabled).toBe(true);
  });

  it('closes without saving anything when cancelled', () => {
    render(<SummaryTable employees={[employee]} loading={false} onChanged={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldos de Kevin Sequeira' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
