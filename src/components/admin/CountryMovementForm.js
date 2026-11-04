import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import es, { interpolate } from '../../content/es';
import { COUNTRY_LIST } from '../../domain/countries';
import { MAX_DATES_PER_BATCH } from '../../domain/countryMovement';
import { formatDate, todayIsoDate } from '../../domain/format';
import { MAX_NOTE_LENGTH } from '../../domain/movementTypes';
import { apiPost } from '../../lib/apiClient';

const IDLE_STATUS = { kind: '', text: '' };
const STATUS_COLORS = { ok: 'text-primary-text', error: 'text-danger-text', '': 'text-ink-soft' };

const peopleText = (count) => (count === 1 ? '1 persona' : `${count} personas`);

/** "Se sumará 1 día de «Feriados por canjear» por cada fecha a cada colaborador activo de Costa Rica (12 personas): …" */
function summaryText({ country, people, dates }) {
  return interpolate(es.admin.countryMovement.summary, {
    country: es.countries[country],
    people: peopleText(people),
    dates: dates.map((date) => formatDate(date)).join(', '),
    total: people * dates.length,
  });
}

function resultText(result) {
  const labels = es.admin.countryMovement;
  return [
    interpolate(labels.done, { created: result.created, people: result.people }),
    result.skipped > 0 ? interpolate(labels.skipped, { skipped: result.skipped }) : '',
    result.failedEmployeeIds.length > 0 ? interpolate(labels.failed, { failed: result.failedEmployeeIds.length }) : '',
  ].join('');
}

function DateChips({ dates, onRemove }) {
  const labels = es.admin.countryMovement;
  if (!dates.length) return <p className="text-sm text-ink-soft">{labels.noDates}</p>;

  return (
    <ul className="flex flex-wrap gap-2">
      {dates.map((date) => (
        <li key={date} className="inline-flex items-center gap-1 rounded-[6px] bg-chip py-0.5 pl-2 pr-1 text-sm">
          {formatDate(date)}
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-ink-soft hover:bg-line hover:text-ink"
            aria-label={interpolate(labels.removeDate, { date: formatDate(date) })}
            onClick={() => onRemove(date)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Registers the holidays of a country: every date added is one day of "Feriados por canjear" for
 * every active collaborator of that country (so the number of dates is the number of days; there is
 * no amount to type). The dates need not be consecutive. Asks for confirmation first, saying how
 * many movements and for whom. The note is required.
 */
export function CountryMovementForm({ employees, onSaved }) {
  const labels = es.admin.countryMovement;
  const [country, setCountry] = useState('');
  const [note, setNote] = useState('');
  const [dates, setDates] = useState([]);
  const [dateToAdd, setDateToAdd] = useState(todayIsoDate());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(IDLE_STATUS);

  const { inCountry, withoutCountry } = useMemo(() => {
    const active = employees.filter((employee) => employee.active);
    return { inCountry: active.filter((employee) => employee.country === country), withoutCountry: active.filter((employee) => !employee.country) };
  }, [employees, country]);

  const canAddDate = Boolean(dateToAdd) && !dates.includes(dateToAdd) && dates.length < MAX_DATES_PER_BATCH;
  const canSubmit = Boolean(country) && inCountry.length > 0 && dates.length > 0 && note.trim().length > 0 && !submitting;

  function addDate() {
    if (!canAddDate) return;
    setDates((previous) => [...previous, dateToAdd].sort());
  }

  async function register() {
    setSubmitting(true);
    setError(null);
    try {
      const { result } = await apiPost('/api/movements/by-country', { country, dates, note });
      setConfirming(false);
      setDates([]);
      setNote('');
      // Like the single movement form: the country is chosen again each time, on purpose
      setCountry('');
      setStatus({ kind: result.failedEmployeeIds.length ? 'error' : 'ok', text: resultText(result) });
      onSaved();
    } catch (registerError) {
      setError(registerError);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setStatus(IDLE_STATUS);
    setConfirming(true);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="form-grid-4">
        <label className="field-label">
          {labels.country}
          <select className="field-input" value={country} onChange={(event) => setCountry(event.target.value)} required>
            <option value="">{labels.countryPlaceholder}</option>
            {COUNTRY_LIST.map((code) => (
              <option key={code} value={code}>
                {es.countries[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {country && (
        <div className="text-xs text-ink-soft">
          <p>
            {inCountry.length === 0
              ? interpolate(labels.peopleNone, { country: es.countries[country] })
              : inCountry.length === 1
                ? interpolate(labels.peopleOne, { country: es.countries[country] })
                : interpolate(labels.people, { count: inCountry.length, country: es.countries[country] })}
          </p>
          {withoutCountry.length > 0 && (
            <p>{withoutCountry.length === 1 ? labels.withoutCountryOne : interpolate(labels.withoutCountry, { count: withoutCountry.length })}</p>
          )}
        </div>
      )}

      <div>
        <p className="field-label">{labels.dates}</p>
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <label className="field-label">
            <span className="sr-only">{labels.dateToAdd}</span>
            <input type="date" className="field-input" aria-label={labels.dateToAdd} value={dateToAdd} onChange={(event) => setDateToAdd(event.target.value)} />
          </label>
          <button type="button" className="btn-ghost" disabled={!canAddDate} onClick={addDate}>
            {labels.addDate}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{labels.datesHint}</p>
        <div className="mt-2" aria-live="polite">
          <DateChips dates={dates} onRemove={(date) => setDates((previous) => previous.filter((item) => item !== date))} />
        </div>
      </div>

      <label className="field-label">
        {es.admin.fields.note}
        <input
          type="text"
          className="field-input"
          maxLength={MAX_NOTE_LENGTH}
          placeholder={labels.notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
        />
        <span className="text-[11px] font-normal text-muted">{labels.noteHint}</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={!canSubmit}>
          {labels.submit}
        </button>
        <span role="status" className={`text-sm ${STATUS_COLORS[status.kind]}`}>
          {status.text}
        </span>
      </div>

      {confirming && (
        <ConfirmDialog
          title={interpolate(labels.confirmTitle, { country: es.countries[country] })}
          message={summaryText({ country, people: inCountry.length, dates })}
          confirmLabel={labels.confirm}
          busy={submitting}
          error={error}
          onConfirm={register}
          onCancel={() => setConfirming(false)}
        />
      )}
    </form>
  );
}
