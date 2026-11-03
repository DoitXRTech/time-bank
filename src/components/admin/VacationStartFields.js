import { useState } from 'react';
import es, { interpolate } from '../../content/es';
import { todayIsoDate } from '../../domain/format';
import { completedMonths } from '../../domain/vacationAccrual';

/**
 * Start date of the automatic vacation accrual (1 day per complete month).
 * When the date is set for the first time and already has complete months, offers to credit them
 * now (checked by default, like the team's sheet); uncheck it when the balance already includes them.
 * Fields: `vacationStartDate` (empty = no accrual) and `creditPastMonths` (checkbox).
 */
export function VacationStartFields({ initialDate = '', hasStartDate }) {
  const [date, setDate] = useState(initialDate);
  const pastMonths = !hasStartDate && date ? completedMonths(date, todayIsoDate()) : 0;
  const labels = es.admin.vacation;

  return (
    <>
      <label className="field-label">
        {labels.startLabel}
        <input
          name="vacationStartDate"
          type="date"
          className="field-input"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      {pastMonths > 0 && (
        <label className="col-span-full flex w-full items-start gap-2 text-sm">
          <input type="checkbox" name="creditPastMonths" defaultChecked className="mt-1 accent-[var(--primary)]" />
          <span>
            {interpolate(labels.creditPast, { count: pastMonths })}
            <span className="block text-xs text-ink-soft">{labels.creditPastHint}</span>
          </span>
        </label>
      )}
    </>
  );
}
