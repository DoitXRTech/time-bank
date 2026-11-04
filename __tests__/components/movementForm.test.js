/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MovementForm } from '@/components/admin/MovementForm';
import { apiPost } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ apiPost: jest.fn() }));

const person = (id, name, active = true) => ({ id, name, active, country: 'CR', balances: {} });
const employees = [person('a', 'Ana'), person('b', 'Beto'), person('c', 'Carla', false)];

const personSelect = () => screen.getByLabelText('Colaborador');
const choose = (id) => fireEvent.change(personSelect(), { target: { value: id } });
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));
  });

beforeEach(() => {
  jest.clearAllMocks();
  apiPost.mockResolvedValue({ movement: { id: 'm1' } });
});

describe('MovementForm: choosing the collaborator on purpose', () => {
  it('starts with nobody chosen, so the first person of the list is never registered by accident', () => {
    render(<MovementForm employees={employees} onSaved={jest.fn()} />);

    expect(personSelect().value).toBe('');
    const options = [...personSelect().querySelectorAll('option')].map((option) => option.textContent);
    expect(options).toEqual(['Seleccione un colaborador', 'Ana', 'Beto']);
  });

  it('cannot be saved until somebody is chosen', async () => {
    render(<MovementForm employees={employees} onSaved={jest.fn()} />);
    fill('Cantidad', '2');

    await save();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('registers the movement for the person chosen', async () => {
    const onSaved = jest.fn();
    render(<MovementForm employees={employees} onSaved={onSaved} />);
    choose('b');
    fill('Cantidad', '2');

    await save();

    expect(apiPost).toHaveBeenCalledWith('/api/movements', expect.objectContaining({ employeeId: 'b', amount: '2' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('goes back to "Seleccione un colaborador" after every movement, so the next one needs a new choice', async () => {
    render(<MovementForm employees={employees} onSaved={jest.fn()} />);
    choose('a');
    fill('Cantidad', '2');
    await save();
    expect(personSelect().value).toBe('');
    expect(screen.getByLabelText('Cantidad').value).toBe('');

    // A second movement right away is not registered for Ana by default
    fill('Cantidad', '3');
    await save();

    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('keeps the person chosen when the server refuses, so the same movement can be retried', async () => {
    apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'CONFLICT', metadata: { reason: 'EMPLOYEE_INACTIVE' } }));
    render(<MovementForm employees={employees} onSaved={jest.fn()} />);
    choose('a');
    fill('Cantidad', '2');

    await save();

    expect(personSelect().value).toBe('a');
    expect(screen.getByRole('status').textContent).toContain('inactivo');
  });
});
