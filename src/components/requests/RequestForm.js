import { useMemo, useState } from 'react';
import { Section } from '../Section';
import es, { interpolate } from '../../content/es';
import { formatMonth, formatSignedAmount, todayIsoDate } from '../../domain/format';
import { recentFinishedMonths } from '../../domain/isoDate';
import { MOVEMENT_UNITS } from '../../domain/movementTypes';
import { REQUEST_ACTIONS, REQUEST_KINDS, REQUEST_OPTIONS } from '../../domain/requestTypes';
import { apiPost } from '../../lib/apiClient';
import { getErrorMessage } from '../../lib/errorMessages';

const IDLE_STATUS = { kind: '', text: '' };
const STATUS_COLORS = { ok: 'text-primary-text', error: 'text-danger-text', '': 'text-ink-soft' };
const MONTHS_OFFERED = 6;
// Overtime comes in quarter hours; days are asked for in half days
const AMOUNT_STEPS = { [REQUEST_KINDS.OVERTIME]: 0.25 };
const DEFAULT_DAY_STEP = 0.5;
// A holiday or the birthday is one day off: that is what the field starts with
const ONE_DAY_KINDS = [REQUEST_KINDS.HOLIDAY, REQUEST_KINDS.BIRTHDAY];

function buildPayload(option, data) {
  const payload = { kind: option.kind, action: option.action, amount: data.get('amount'), note: data.get('note') };
  return option.action === REQUEST_ACTIONS.REPORT ? { ...payload, month: data.get('month') } : { ...payload, date: data.get('date') };
}

/**
 * Where a collaborator reports the overtime of a finished month or asks for a day off: redeeming
 * overtime hours, vacation, a holiday they are owed or their birthday. It only files a request:
 * nothing moves in their balance until an admin approves it (and then a redeem takes it out).
 * `balances` (their own) is only there to show what they have before they ask.
 */
export function RequestForm({ onSent, balances }) {
  const [optionId, setOptionId] = useState(REQUEST_OPTIONS[0].id);
  // Changing it remounts the fields, which brings back their defaults after a successful send
  const [formVersion, setFormVersion] = useState(0);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [submitting, setSubmitting] = useState(false);
  const today = todayIsoDate();
  const months = useMemo(() => recentFinishedMonths(today, MONTHS_OFFERED), [today]);
  const option = REQUEST_OPTIONS.find(({ id }) => id === optionId);
  const texts = es.requests.options[option.id];
  const isReport = option.action === REQUEST_ACTIONS.REPORT;
  const step = AMOUNT_STEPS[option.kind] ?? DEFAULT_DAY_STEP;
  const labels = es.requests;
  const balance = balances?.[option.kind];

  function handleOptionChange(event) {
    setOptionId(event.target.value);
    setStatus(IDLE_STATUS);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setSubmitting(true);
    setStatus({ kind: '', text: labels.sending });
    try {
      await apiPost('/api/requests', buildPayload(option, data));
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
            {labels.fields.option}
            <select className="field-input" value={optionId} onChange={handleOptionChange}>
              {REQUEST_OPTIONS.map(({ id }) => (
                <option key={id} value={id}>
                  {labels.options[id].label}
                </option>
              ))}
            </select>
          </label>

          {isReport ? (
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
            <label key={`date-${optionId}-${formVersion}`} className="field-label">
              {texts.dateLabel}
              <input name="date" type="date" className="field-input" defaultValue={today} required />
            </label>
          )}

          <label key={`amount-${optionId}-${formVersion}`} className="field-label">
            {texts.amountLabel}
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min={step}
              step={step}
              defaultValue={ONE_DAY_KINDS.includes(option.kind) ? 1 : undefined}
              className="field-input"
              required
            />
          </label>

          <label key={`note-${optionId}-${formVersion}`} className="field-label col-span-full">
            {labels.fields.note}
            <input name="note" type="text" className="field-input" maxLength={500} placeholder={texts.notePlaceholder} />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{texts.hint}</p>
        {!isReport && balance !== undefined && (
          <p className="num text-xs text-ink-soft">
            {interpolate(labels.balanceNow, { balance: formatSignedAmount(balance, MOVEMENT_UNITS[option.kind]) })}
          </p>
        )}
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
