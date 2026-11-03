import { useState } from 'react';
import es from '../../content/es';
import { AMOUNT_STEP, MOVEMENT_TYPE_LIST } from '../../domain/movementTypes';
import { apiPatch } from '../../lib/apiClient';
import { ErrorNotice } from '../ErrorNotice';

/** Only the fields that really changed are sent, so an untouched correction writes nothing */
function changedFields(movement, formData) {
  const next = {
    employeeId: formData.get('employeeId'),
    type: formData.get('type'),
    amount: Number(formData.get('amount')),
    date: formData.get('date'),
    note: formData.get('note').trim(),
  };
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => value !== movement[field]));
}

/**
 * Inline correction of one movement. The server re-balances the affected employees and keeps the
 * previous values in the movement's edit history.
 */
export function MovementEditForm({ movement, employees, onSaved, onCancel }) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const labels = es.admin.fields;

  async function handleSubmit(event) {
    event.preventDefault();
    const patch = changedFields(movement, new FormData(event.currentTarget));
    if (!Object.keys(patch).length) {
      onCancel();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/movements/${encodeURIComponent(movement.id)}`, patch);
      onSaved();
    } catch (saveError) {
      setError(saveError);
      setSaving(false);
    }
  }

  return (
    <form className="animate-fade-up rounded-[8px] bg-chip p-4" onSubmit={handleSubmit}>
      <div className="form-grid-4">
        <label className="field-label">
          {labels.employee}
          <select name="employeeId" className="field-input" defaultValue={movement.employeeId}>
            {employees
              .filter((employee) => employee.active || employee.id === movement.employeeId)
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field-label">
          {labels.type}
          <select name="type" className="field-input" defaultValue={movement.type}>
            {MOVEMENT_TYPE_LIST.map((type) => (
              <option key={type} value={type}>
                {es.movementType[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {labels.amount}
          <input name="amount" type="number" step={AMOUNT_STEP} className="field-input" defaultValue={movement.amount} required />
        </label>
        <label className="field-label">
          {labels.date}
          <input name="date" type="date" className="field-input" defaultValue={movement.date} required />
        </label>
        <label className="field-label col-span-full">
          {labels.note}
          <input name="note" type="text" className="field-input" maxLength={500} defaultValue={movement.note} />
        </label>
      </div>

      <p className="mt-3 text-xs text-ink-soft">{es.admin.editMovement.hint}</p>
      <ErrorNotice error={error} />

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="submit" className="btn" disabled={saving}>
          {es.admin.editMovement.save}
        </button>
        <button type="button" className="btn-ghost" disabled={saving} onClick={onCancel}>
          {es.admin.editMovement.cancel}
        </button>
      </div>
    </form>
  );
}
