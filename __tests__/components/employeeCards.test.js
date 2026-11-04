/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { EmployeeManager } from '@/components/team/EmployeeManager';

jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn(), apiPatch: jest.fn(), apiPost: jest.fn(), isAccessLostError: () => false }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ employee: { id: 'a1' }, signedInEmail: 'ana@x.com' }),
}));

const person = (id, name, role) => ({
  id,
  name,
  role,
  jobTitle: 'Desarrollo',
  team: '',
  active: true,
  emails: [`${id}@x.com`],
  hireDate: '2022-08-02',
});

const employees = [person('a1', 'Ana Admin', 'admin'), person('m1', 'Luis Colaborador', 'member')];

describe('Employee cards', () => {
  it('shows a role badge for admins and collaborators alike', () => {
    render(<EmployeeManager employees={employees} loading={false} onChanged={jest.fn()} />);
    const nameLine = (name) => screen.getByText(name).closest('p');
    expect(within(nameLine('Ana Admin')).getByText('Administrador')).toBeInTheDocument();
    expect(within(nameLine('Luis Colaborador')).getByText('Colaborador')).toBeInTheDocument();
  });

  it('expands one card at a time and collapses it again', () => {
    render(<EmployeeManager employees={employees} loading={false} onChanged={jest.fn()} />);
    const ana = screen.getByRole('button', { name: 'Ver detalles de Ana Admin' });
    const luis = screen.getByRole('button', { name: 'Ver detalles de Luis Colaborador' });
    expect(ana).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(ana);
    expect(screen.getByRole('button', { name: 'Ocultar detalles de Ana Admin' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(luis);
    expect(screen.getByRole('button', { name: 'Ver detalles de Ana Admin' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Ocultar detalles de Luis Colaborador' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar detalles de Luis Colaborador' }));
    expect(screen.getByRole('button', { name: 'Ver detalles de Luis Colaborador' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the add form out of the page until "Agregar persona" opens it in a dialog', () => {
    render(<EmployeeManager employees={employees} loading={false} onChanged={jest.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar persona' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Nombre')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
