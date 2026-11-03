import { useState } from 'react';
import es from '../../content/es';
import { todayIsoDate } from '../../domain/format';
import { AMOUNT_STEP, MOVEMENT_TYPE_LIST } from '../../domain/movementTypes';
import { apiPost } from '../../lib/apiClient';
import { getErrorMessage } from '../../lib/errorMessages';
import { Section } from '../Section';

const IDLE_STATUS = { kind: '', text: '' };
const STATUS_COLORS = { ok: 'text-primary-text', error: 'text-danger-text', '': 'text-ink-soft' };

export function MovementForm({ employees, onSaved }) {
  const [status, setStatus] = useState(IDLE_STATUS);
  const [submitting, setSubmitting] = useState(false);
  const activeEmployees = employees.filter((employee) => employee.active);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setSubmitting(true);
    setStatus({ kind: '', text: es.admin.saving });
    try {
      await apiPost('/api/movements', {
        employeeId: data.get('employeeId'),
        type: data.get('type'),
        amount: data.get('amount'),
        date: data.get('date'),
        note: data.get('note'),
      });
      form.reset();
      setStatus({ kind: 'ok', text: es.admin.saved });
      onSaved();
    } catch (error) {
      setStatus({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Section title={es.admin.movementFormTitle}>
      <form className="flex flex-col gap-1" onSubmit={handleSubmit}>
        <div className="form-grid-4">
          <label className="field-label">
            {es.admin.fields.employee}
            <select name="employeeId" className="field-input" required>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            {es.admin.fields.type}
            <select name="type" className="field-input">
              {MOVEMENT_TYPE_LIST.map((type) => (
                <option key={type} value={type}>
                  {es.movementType[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            {es.admin.fields.amount}
            <input
              name="amount"
              type="number"
              step={AMOUNT_STEP}
              className="field-input"
              placeholder={es.admin.fields.amountPlaceholder}
              required
            />
          </label>
          <label className="field-label">
            {es.admin.fields.date}
            <input name="date" type="date" className="field-input" defaultValue={todayIsoDate()} required />
          </label>
          <label className="field-label col-span-full">
            {es.admin.fields.note}
            <input name="note" type="text" className="field-input" maxLength={500} placeholder={es.admin.fields.notePlaceholder} />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{es.admin.amountHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn" disabled={submitting}>
            {es.admin.saveMovement}
          </button>
          <span role="status" className={`text-sm ${STATUS_COLORS[status.kind]}`}>
            {status.text}
          </span>
        </div>
      </form>
    </Section>
  );
}
