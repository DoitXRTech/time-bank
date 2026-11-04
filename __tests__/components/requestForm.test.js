/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RequestForm } from '@/components/requests/RequestForm';
import { RequestsInbox } from '@/components/admin/RequestsInbox';
import { requestLabel, requestSummary } from '@/components/requests/requestSummary';
import { todayIsoDate } from '@/domain/format';
import { recentFinishedMonths } from '@/domain/isoDate';
import { apiPost } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({ apiPost: jest.fn() }));

const balances = { overtime: 6, vacation: 2, holiday: 1, birthday: 0 };

async function submit(container) {
  await act(async () => {
    fireEvent.submit(container.querySelector('form'));
  });
}

const pick = (label) => fireEvent.change(screen.getByLabelText('Qué quiere enviar'), { target: { value: label } });
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  jest.clearAllMocks();
  apiPost.mockResolvedValue({ request: { id: 'r1' } });
});

describe('RequestForm: what a collaborator can ask for', () => {
  it('offers the five things: report hours, redeem hours, vacation, a holiday and the birthday', () => {
    render(<RequestForm onSent={jest.fn()} balances={balances} />);

    const labels = [...screen.getByLabelText('Qué quiere enviar').querySelectorAll('option')].map((option) => option.textContent);
    expect(labels).toEqual([
      'Reportar horas extra de un mes',
      'Canjear horas extra',
      'Pedir vacaciones',
      'Canjear un feriado',
      'Canjear el día de cumpleaños',
    ]);
  });

  it('reports overtime for the last finished month by default', async () => {
    const onSent = jest.fn();
    const { container } = render(<RequestForm onSent={onSent} balances={balances} />);
    fill('Horas extra trabajadas', '5.5');

    await submit(container);

    expect(apiPost).toHaveBeenCalledWith('/api/requests', {
      kind: 'overtime',
      action: 'report',
      amount: '5.5',
      note: '',
      month: recentFinishedMonths(todayIsoDate(), 1)[0],
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Solicitud enviada');
  });

  it('redeems a holiday on a specific day, starting at one day', async () => {
    const { container } = render(<RequestForm onSent={jest.fn()} balances={balances} />);
    pick('holiday');

    expect(screen.getByLabelText('Días').value).toBe('1');
    fill('Día en que lo canjea', '2026-12-24');
    await submit(container);

    expect(apiPost).toHaveBeenCalledWith('/api/requests', { kind: 'holiday', action: 'redeem', amount: '1', note: '', date: '2026-12-24' });
  });

  it('redeems the birthday on a specific day', async () => {
    const { container } = render(<RequestForm onSent={jest.fn()} balances={balances} />);
    pick('birthday');
    fill('Día que se toma', '2026-11-27');

    await submit(container);

    expect(apiPost).toHaveBeenCalledWith('/api/requests', { kind: 'birthday', action: 'redeem', amount: '1', note: '', date: '2026-11-27' });
  });

  it('redeems overtime hours on a day, which is not the same as reporting them', async () => {
    const { container } = render(<RequestForm onSent={jest.fn()} balances={balances} />);
    pick('overtime-redeem');
    fill('Día que se toma', '2026-11-20');
    fill('Horas a canjear', '4');

    await submit(container);

    expect(apiPost).toHaveBeenCalledWith('/api/requests', { kind: 'overtime', action: 'redeem', amount: '4', note: '', date: '2026-11-20' });
  });

  it('asks for vacation from a first day with the days wanted', async () => {
    const { container } = render(<RequestForm onSent={jest.fn()} balances={balances} />);
    pick('vacation');
    fill('Primer día de vacaciones', '2026-12-01');
    fill('Días', '3');

    await submit(container);

    expect(apiPost).toHaveBeenCalledWith('/api/requests', { kind: 'vacation', action: 'redeem', amount: '3', note: '', date: '2026-12-01' });
  });

  it('shows what the person has before redeeming, and nothing when they are only reporting', () => {
    render(<RequestForm onSent={jest.fn()} balances={balances} />);
    expect(screen.queryByText(/Su saldo actual/)).toBeNull();

    pick('overtime-redeem');
    expect(screen.getByText('Su saldo actual: +6 h')).toBeTruthy();

    pick('birthday');
    expect(screen.getByText('Su saldo actual: 0 d')).toBeTruthy();
  });

  it('shows the error and does not clear the form when the server refuses', async () => {
    apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'VALIDATION_ERROR', metadata: { reason: 'MONTH_NOT_FINISHED' } }));
    const onSent = jest.fn();
    const { container } = render(<RequestForm onSent={onSent} balances={balances} />);
    fill('Horas extra trabajadas', '2');

    await submit(container);

    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('meses que ya terminaron');
    expect(screen.getByLabelText('Horas extra trabajadas').value).toBe('2');
  });
});

describe('how a request reads', () => {
  const request = (fields) => ({ id: 'r', employeeId: 'e1', status: 'pending', note: '', period: null, createdAt: '2026-11-04T10:00:00.000Z', ...fields });

  it('names each kind of request and says what it asks for', () => {
    const report = request({ kind: 'overtime', action: 'report', amount: 5, period: '2026-10', date: '2026-10-31' });
    const redeemHours = request({ kind: 'overtime', action: 'redeem', amount: 4, date: '2026-11-20' });
    const vacation = request({ kind: 'vacation', action: 'redeem', amount: 3, date: '2026-11-17' });
    const holiday = request({ kind: 'holiday', action: 'redeem', amount: 1, date: '2026-12-24' });

    expect(requestLabel(report)).toBe('Reportar horas extra de un mes');
    expect(requestLabel(redeemHours)).toBe('Canjear horas extra');
    expect(requestLabel(vacation)).toBe('Pedir vacaciones');
    expect(requestLabel(holiday)).toBe('Canjear un feriado');

    expect(requestSummary(report)).toMatch(/^5 h de octubre de 2026$/i);
    expect(requestSummary(redeemHours)).toMatch(/^4 h el 20 /);
    expect(requestSummary(vacation)).toMatch(/^3 d desde el 17 /);
    expect(requestSummary(holiday)).toMatch(/^1 d el 24 /);
  });

  it('reads a request stored before redeeming existed', () => {
    expect(requestLabel(request({ kind: 'overtime', amount: 5, period: '2026-10', date: '2026-10-31' }))).toBe('Reportar horas extra de un mes');
    expect(requestLabel(request({ kind: 'vacation', amount: 3, date: '2026-11-17' }))).toBe('Pedir vacaciones');
  });
});

describe('the admin inbox flags a redeem that goes beyond the balance', () => {
  const employees = [{ id: 'e1', name: 'Ana', active: true, balances: { overtime: 2, vacation: 5, holiday: 0, birthday: 1 } }];
  const base = { employeeId: 'e1', status: 'pending', note: '', period: null, createdAt: '2026-11-04T10:00:00.000Z' };
  const inbox = (requests) => render(<RequestsInbox requests={requests} employees={employees} loading={false} error={null} onChanged={jest.fn()} />);

  it('flags hours, holidays or a birthday asked for without having them', () => {
    inbox([
      { ...base, id: 'a', kind: 'overtime', action: 'redeem', amount: 4, date: '2026-11-20' },
      { ...base, id: 'b', kind: 'holiday', action: 'redeem', amount: 1, date: '2026-12-24' },
    ]);

    expect(screen.getAllByText('Supera su saldo')).toHaveLength(2);
  });

  it('does not flag what they do have, nor a report (it adds, it does not take)', () => {
    inbox([
      { ...base, id: 'a', kind: 'birthday', action: 'redeem', amount: 1, date: '2026-11-27' },
      { ...base, id: 'b', kind: 'overtime', action: 'report', amount: 30, date: '2026-10-31', period: '2026-10' },
    ]);

    expect(screen.queryByText('Supera su saldo')).toBeNull();
  });
});
