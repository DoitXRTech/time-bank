import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ErrorNotice } from '../ErrorNotice';
import { Modal } from '../Modal';
import es, { interpolate } from '../../content/es';
import { balanceChanges } from '../../domain/balanceAdjustment';
import { formatSignedAmount } from '../../domain/format';
import { AMOUNT_STEP, MAX_NOTE_LENGTH, MOVEMENT_TYPE_LIST, MOVEMENT_UNITS } from '../../domain/movementTypes';
import { apiPost } from '../../lib/apiClient';

const toInputValues = (balances) => Object.fromEntries(MOVEMENT_TYPE_LIST.map((type) => [type, String(balances[type])]));

/**
 * Dialog to force a collaborator's balances to what they should be (the Excel was misread, a
 * mistake piled up). The admin types how each balance has to end up and a note about what was
 * done; the server registers each difference as an adjustment movement that stays in the history.
 */
export function BalanceAdjustDialog({ employee, onSaved, onCancel }) {
  const titleId = useId();
  const messageId = useId();
  const firstFieldRef = useRef(null);
  const [values, setValues] = useState(() => toInputValues(employee.balances));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const labels = es.admin.adjust;

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const changes = useMemo(() => balanceChanges(values, employee.balances), [values, employee.balances]);
  const canSave = !busy && changes.length > 0 && note.trim().length > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;

    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/employees/${encodeURIComponent(employee.id)}/balances`, { balances: values, note });
      onSaved();
    } catch (saveError) {
      setError(saveError);
      setBusy(false);
    }
  }

  return (
    <Modal labelledBy={titleId} describedBy={messageId} size="lg" busy={busy} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <h2 id={titleId} className="text-lg font-semibold">
          {interpolate(labels.title, { name: employee.name })}
        </h2>
        <p id={messageId} className="mt-1 text-sm text-ink-soft">
          {labels.message}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MOVEMENT_TYPE_LIST.map((type, index) => (
            <label key={type} className="field-label">
              {es.movementType[type]} ({MOVEMENT_UNITS[type]})
              <input
                ref={index === 0 ? firstFieldRef : undefined}
                type="number"
                inputMode="decimal"
                step={AMOUNT_STEP}
                className="field-input num"
                value={values[type]}
                disabled={busy}
                required
                onChange={(event) => setValues((previous) => ({ ...previous, [type]: event.target.value }))}
              />
              <span className="num text-[11px] font-normal text-muted">
                {interpolate(labels.current, { balance: formatSignedAmount(employee.balances[type], MOVEMENT_UNITS[type]) })}
              </span>
            </label>
          ))}
        </div>

        <label className="field-label mt-5">
          {labels.noteLabel}
          <textarea
            className="field-input min-h-[96px] resize-none py-2.5"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            placeholder={labels.notePlaceholder}
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
          <span className="num self-end text-[11px] font-normal text-muted">
            {note.length}/{MAX_NOTE_LENGTH}
          </span>
        </label>

        <div className="mt-4 text-sm" aria-live="polite">
          <p className="text-xs font-bold text-ink-soft">{labels.changesTitle}</p>
          {changes.length === 0 ? (
            <p className="mt-1 text-ink-soft">{labels.noChanges}</p>
          ) : (
            <ul className="num mt-1 list-disc pl-5">
              {changes.map(({ type, amount, from, to }) => (
                <li key={type}>
                  {interpolate(labels.changeLine, {
                    type: es.movementType[type],
                    delta: formatSignedAmount(amount, MOVEMENT_UNITS[type]),
                    from: formatSignedAmount(from, MOVEMENT_UNITS[type]),
                    to: formatSignedAmount(to, MOVEMENT_UNITS[type]),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ErrorNotice error={error} />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn" disabled={!canSave}>
            {labels.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
