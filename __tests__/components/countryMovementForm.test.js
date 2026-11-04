/** @jest-environment jsdom */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MovementForm } from '@/components/admin/MovementForm';
import { EmployeeRecordFields } from '@/components/team/EmployeeRecordFields';
import { readRecordFields } from '@/components/team/employeeForm';
import { apiPost } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ apiPost: jest.fn() }));

const person = (id, name, country, active = true) => ({ id, name, country, active, balances: { overtime: 0, vacation: 0, holiday: 0, birthday: 0 } });
const employees = [
  person('a', 'Ana', 'CR'),
  person('b', 'Beto', 'CR'),
  person('c', 'Carla', 'CO'),
  person('d', 'Dino', null),
  person('e', 'Eva', 'CR', false),
];

const doneResult = { result: { batchId: 'b1', people: 2, created: 4, skipped: 0, failedEmployeeIds: [] } };

beforeEach(() => {
  jest.clearAllMocks();
  apiPost.mockResolvedValue(doneResult);
});

function openCountryMode(props = {}) {
  const onSaved = jest.fn();
  render(<MovementForm employees={employees} onSaved={onSaved} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Todo un país' }));
  return onSaved;
}

const chooseCountry = (code) => fireEvent.change(screen.getByLabelText('País'), { target: { value: code } });
const addDate = (iso) => {
  fireEvent.change(screen.getByLabelText('Fecha a agregar'), { target: { value: iso } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }));
};
const writeNote = (text) => fireEvent.change(screen.getByLabelText(/^Nota/), { target: { value: text } });
const submitButton = () => screen.getByRole('button', { name: 'Registrar para el país' });

describe('MovementForm: who the movement is for', () => {
  it('starts as before, for one collaborator, and switches to a whole country', () => {
    render(<MovementForm employees={employees} onSaved={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Un colaborador' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Guardar movimiento' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Todo un país' }));

    expect(screen.getByRole('button', { name: 'Todo un país' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('País')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar movimiento' })).toBeNull();
  });
});

describe('CountryMovementForm', () => {
  it('asks only for the country, the dates and a note: each date is one holiday day, so there is no amount or type to choose', () => {
    openCountryMode();

    expect(screen.queryByLabelText('Cantidad')).toBeNull();
    expect(screen.queryByLabelText('Tipo')).toBeNull();
    expect(screen.getByText(/Cada fecha suma 1 día de «Feriados por canjear»/)).toBeTruthy();
  });

  it('offers the four countries', () => {
    openCountryMode();

    const options = [...screen.getByLabelText('País').querySelectorAll('option')].map((option) => option.textContent);
    expect(options).toEqual(['Elija un país', 'Costa Rica', 'Colombia', 'Argentina', 'Ecuador']);
  });

  it('says how many active people the country has, and how many have no country and are left out', () => {
    openCountryMode();

    chooseCountry('CR');

    expect(screen.getByText('2 colaboradores activos en Costa Rica')).toBeTruthy();
    expect(screen.getByText('1 colaborador activo no tiene país y no se incluye.')).toBeTruthy();

    chooseCountry('CO');
    expect(screen.getByText('1 colaborador activo en Colombia')).toBeTruthy();

    chooseCountry('AR');
    expect(screen.getByText(/No hay colaboradores activos en Argentina/)).toBeTruthy();
  });

  it('collects several days that are not consecutive, without repeating one, and lets one be removed', () => {
    openCountryMode();

    addDate('2026-11-19');
    addDate('2026-11-02');
    addDate('2026-11-19');

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByRole('listitem')[0].textContent).toMatch(/02/);

    fireEvent.click(within(list).getAllByRole('button')[0]);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('cannot be sent without a country, a date and a note', () => {
    openCountryMode();
    expect(submitButton().disabled).toBe(true);

    chooseCountry('CR');
    addDate('2026-11-19');
    expect(submitButton().disabled).toBe(true);

    writeNote('   ');
    expect(submitButton().disabled).toBe(true);

    writeNote('Feriados de noviembre');
    expect(submitButton().disabled).toBe(false);
  });

  it('cannot be sent to a country with nobody in it', () => {
    openCountryMode();
    chooseCountry('AR');
    addDate('2026-11-19');
    writeNote('x');

    expect(submitButton().disabled).toBe(true);
  });

  it('asks for confirmation saying what will happen, then sends it and reports the result', async () => {
    const onSaved = openCountryMode();
    chooseCountry('CR');
    addDate('2026-11-02');
    addDate('2026-11-19');
    writeNote('Feriados de noviembre');

    fireEvent.click(submitButton());

    const dialog = screen.getByRole('dialog');
    expect(apiPost).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('Registrar para Costa Rica');
    expect(dialog.textContent).toContain('Se sumará 1 día de «Feriados por canjear» por cada fecha');
    expect(dialog.textContent).toContain('(2 personas)');
    expect(dialog.textContent).toContain('Total: 4 movimientos');

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    });

    expect(apiPost).toHaveBeenCalledWith('/api/movements/by-country', {
      country: 'CR',
      dates: ['2026-11-02', '2026-11-19'],
      note: 'Feriados de noviembre',
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Listo: 4 movimientos para 2 personas.');
    // The dates and the note are cleared so the same batch is not sent twice by accident
    expect(screen.getByText('Todavía no agregó ninguna fecha.')).toBeTruthy();
  });

  it('mentions what was skipped because it was already registered, and who could not be registered', async () => {
    apiPost.mockResolvedValueOnce({ result: { batchId: 'b', people: 1, created: 2, skipped: 2, failedEmployeeIds: ['b'] } });
    openCountryMode();
    chooseCountry('CR');
    addDate('2026-11-02');
    writeNote('Feriados');

    fireEvent.click(submitButton());
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar' }));
    });

    const text = screen.getByRole('status').textContent;
    expect(text).toContain('Se omitieron 2 que ya estaban registrados.');
    expect(text).toContain('No se pudo registrar a 1 personas');
  });

  it('keeps the dialog open with the error when the server refuses, and nothing is cleared', async () => {
    apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'CONFLICT', metadata: { reason: 'NO_EMPLOYEES_IN_COUNTRY' } }));
    const onSaved = openCountryMode();
    chooseCountry('CR');
    addDate('2026-11-02');
    writeNote('Feriados');

    fireEvent.click(submitButton());
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar' }));
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('No hay colaboradores activos con ese país');
  });

  it('does nothing when the confirmation is cancelled', () => {
    openCountryMode();
    chooseCountry('CR');
    addDate('2026-11-02');
    writeNote('Feriados');

    fireEvent.click(submitButton());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('EmployeeRecordFields: country and the single hire date', () => {
  const renderInForm = (props) => render(<form><EmployeeRecordFields {...props} /></form>);

  it('has no "Caja" date, no "vacations from" date and says how vacations accrue', () => {
    renderInForm({ requireCountry: true });

    expect(screen.queryByLabelText(/Caja/)).toBeNull();
    expect(screen.queryByLabelText(/Vacaciones desde/)).toBeNull();
    expect(screen.getByLabelText('Fecha de ingreso')).toBeTruthy();
    expect(screen.getByText(/1 día por cada mes completo desde la fecha de ingreso/)).toBeTruthy();
  });

  it('requires one of the four countries when adding someone', () => {
    renderInForm({ requireCountry: true });

    const select = screen.getByLabelText('País');
    expect(select.required).toBe(true);
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Elija un país', 'Costa Rica', 'Colombia', 'Argentina', 'Ecuador']);
  });

  it('lets an older record without a country be saved as it is, and a record with one cannot go back to none', () => {
    const { unmount } = renderInForm({ employee: { country: null } });
    expect(screen.getByLabelText('País').required).toBe(false);
    unmount();

    renderInForm({ employee: { country: 'CO' } });
    const options = [...screen.getByLabelText('País').querySelectorAll('option')].map((option) => option.textContent);
    expect(options).not.toContain('Elija un país');
    expect(screen.getByLabelText('País').value).toBe('CO');
  });

  it('offers to credit the months already completed only when accrual is about to start', () => {
    renderInForm({ requireCountry: true });
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(screen.getByLabelText('Fecha de ingreso'), { target: { value: '2020-01-15' } });
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(screen.getByLabelText('Contratación'), { target: { value: 'internship' } });
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(screen.getByLabelText('Contratación'), { target: { value: 'payroll' } });
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByText(/Acreditar ahora los \d+ meses ya cumplidos/)).toBeTruthy();
  });

  it('does not offer it to someone who already accrues', () => {
    renderInForm({ employee: { hireDate: '2020-01-15', employmentType: 'payroll', vacationStartDate: '2020-01-15', country: 'CR' } });

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('readRecordFields', () => {
  const form = (fields) => {
    const data = new FormData();
    Object.entries(fields).forEach(([key, value]) => data.set(key, value));
    return data;
  };

  it('sends the country only when one is chosen, and never a vacation start or a Caja date', () => {
    const withCountry = readRecordFields(form({ country: 'EC', team: 'Diseño', hireDate: '2024-01-02', employmentType: 'payroll', scheduleStart: '', scheduleEnd: '' }));
    expect(withCountry).toEqual({ country: 'EC', team: 'Diseño', hireDate: '2024-01-02', employmentType: 'payroll', scheduleStart: '', scheduleEnd: '', creditPastMonths: false });

    const without = readRecordFields(form({ country: '', hireDate: '', employmentType: '' }));
    expect(without).not.toHaveProperty('country');
    expect(without).toMatchObject({ hireDate: null, employmentType: null });
    expect(withCountry).not.toHaveProperty('vacationStartDate');
    expect(withCountry).not.toHaveProperty('socialSecurityDate');
  });
});
