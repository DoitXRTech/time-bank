import { useMemo, useState } from 'react';
import { Section } from '../Section';
import es from '../../content/es';
import { formatMonth, todayIsoDate } from '../../domain/format';
import { recentFinishedMonths } from '../../domain/isoDate';
import { REQUEST_KIND_LIST, REQUEST_KINDS } from '../../domain/requestTypes';
import { apiPost } from '../../lib/apiClient';
import { getErrorMessage } from '../../lib/errorMessages';

const IDLE_STATUS = { kind: '', text: '' };
const STATUS_COLORS = { ok: 'text-primary-text', error: 'text-danger-text', '': 'text-ink-soft' };
const MONTHS_OFFERED = 6;
// Overtime comes in quarter hours; vacation is asked for in half days
const AMOUNT_STEPS = { [REQUEST_KINDS.OVERTIME]: 0.25, [REQUEST_KINDS.VACATION]: 0.5 };

function buildPayload(kind, data) {
  const base = { kind, amount: data.get('amount'), note: data.get('note') };
  return kind === REQUEST_KINDS.OVERTIME ? { ...base, month: data.get('month') } : { ...base, date: data.get('date') };
}

/**
 * Where a collaborator reports the overtime of a finished month or asks for vacation days.
 * It only files a request: nothing moves in their balance until an admin approves it.
 */
export function RequestForm({ onSent }) {
  const [kind, setKind] = useState(REQUEST_KINDS.OVERTIME);
  // Changing it remounts the fields, which brings back their defaults after a successful send
  const [formVersion, setFormVersion] = useState(0);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [submitting, setSubmitting] = useState(false);
  const today = todayIsoDate();
  const months = useMemo(() => recentFinishedMonths(today, MONTHS_OFFERED), [today]);
  const isOvertime = kind === REQUEST_KINDS.OVERTIME;
  const labels = es.requests;

  function handleKindChange(event) {
    setKind(event.target.value);
    setStatus(IDLE_STATUS);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setSubmitting(true);
    setStatus({ kind: '', text: labels.sending });
    try {
      await apiPost('/api/requests', buildPayload(kind, data));
      setFormVersion((version) => version + 1);
      setStatus({ kind: 'ok', text: labels.sent });
      onSent();
    } catch (error) {
      setStatus({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Section title={labels.formTitle}>
      <p className="mb-4 text-xs text-ink-soft">{labels.formDescription}</p>
      <form className="flex flex-col gap-1" onSubmit={handleSubmit}>
        <div className="form-grid-4">
          <label className="field-label">
            {labels.fields.kind}
            <select className="field-input" value={kind} onChange={handleKindChange}>
              {REQUEST_KIND_LIST.map((option) => (
                <option key={option} value={option}>
                  {labels.kinds[option]}
                </option>
              ))}
            </select>
          </label>

          {isOvertime ? (
            <label key={`month-${formVersion}`} className="field-label">
              {labels.fields.month}
              <select name="month" className="field-input" defaultValue={months[0]}>
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonth(month)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={`date-${formVersion}`} className="field-label">
              {labels.fields.startDate}
              <input name="date" type="date" className="field-input" defaultValue={today} required />
            </label>
          )}

          <label key={`amount-${kind}-${formVersion}`} className="field-label">
            {isOvertime ? labels.fields.hours : labels.fields.days}
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min={AMOUNT_STEPS[kind]}
              step={AMOUNT_STEPS[kind]}
              className="field-input"
              required
            />
          </label>

          <label key={`note-${kind}-${formVersion}`} className="field-label col-span-full">
            {labels.fields.note}
            <input name="note" type="text" className="field-input" maxLength={500} placeholder={labels.notePlaceholder[kind]} />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{labels.hints[kind]}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn" disabled={submitting}>
            {labels.submit}
          </button>
          <span role="status" className={`text-sm ${STATUS_COLORS[status.kind]}`}>
            {status.text}
          </span>
        </div>
      </form>
    </Section>
  );
}
