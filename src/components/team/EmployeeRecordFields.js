import { useState } from 'react';
import es, { interpolate } from '../../content/es';
import { COUNTRY_LIST } from '../../domain/countries';
import { EMPLOYMENT_TYPE_LIST } from '../../domain/employmentTypes';
import { todayIsoDate } from '../../domain/format';
import { completedMonths } from '../../domain/vacationAccrual';
import { accruesVacation } from '../../domain/vacationEligibility';

const TEAM_OPTIONS_ID = 'team-options';

/**
 * The months that would be credited the first time vacations start accruing: only when the person
 * has no start yet, their contract type earns vacations and they have a hire date with months behind.
 */
function creditableMonths({ employee, hireDate, employmentType }) {
  if (employee.vacationStartDate || !accruesVacation(employmentType) || !hireDate) return 0;
  return completedMonths(hireDate, todayIsoDate());
}

/**
 * The employee record fields shared by the "add" and "edit" forms: country, team, hire date,
 * employment type and schedule. Meant to sit inside a `.form-grid-4`. `teams` feeds the suggestions
 * of the team field (existing teams, free text allowed). The country is required when adding
 * someone (`requireCountry`); an older record without one can still be saved without it.
 *
 * The hire date is the only date: vacations accrue from it (see `nextVacationStart`), so the form
 * explains the rule and, when accrual is about to start with months already behind, offers to
 * credit them (`creditPastMonths`).
 */
export function EmployeeRecordFields({ employee = {}, teams = [], requireCountry = false }) {
  const labels = es.team.fields;
  const [hireDate, setHireDate] = useState(employee.hireDate ?? '');
  const [employmentType, setEmploymentType] = useState(employee.employmentType ?? '');
  const pastMonths = creditableMonths({ employee, hireDate, employmentType });

  return (
    <>
      <label className="field-label">
        {labels.country}
        <select name="country" className="field-input" defaultValue={employee.country ?? ''} required={requireCountry}>
          {(!employee.country || requireCountry) && <option value="">{labels.countryPlaceholder}</option>}
          {COUNTRY_LIST.map((country) => (
            <option key={country} value={country}>
              {es.countries[country]}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        {labels.team}
        <input name="team" type="text" className="field-input" list={TEAM_OPTIONS_ID} defaultValue={employee.team ?? ''} placeholder={labels.teamPlaceholder} />
        <datalist id={TEAM_OPTIONS_ID}>
          {teams.map((team) => (
            <option key={team} value={team} />
          ))}
        </datalist>
      </label>
      <label className="field-label">
        {labels.hireDate}
        <input name="hireDate" type="date" className="field-input" value={hireDate} onChange={(event) => setHireDate(event.target.value)} />
      </label>
      <label className="field-label">
        {labels.employmentType}
        <select name="employmentType" className="field-input" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
          <option value="">{labels.notDefined}</option>
          {EMPLOYMENT_TYPE_LIST.map((type) => (
            <option key={type} value={type}>
              {es.team.employmentTypes[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        {labels.scheduleStart}
        <input name="scheduleStart" type="text" className="field-input" maxLength={60} defaultValue={employee.scheduleStart ?? ''} placeholder={labels.schedulePlaceholder} />
      </label>
      <label className="field-label">
        {labels.scheduleEnd}
        <input name="scheduleEnd" type="text" className="field-input" maxLength={60} defaultValue={employee.scheduleEnd ?? ''} placeholder={labels.schedulePlaceholder} />
      </label>

      <p className="col-span-full text-xs text-ink-soft">{es.admin.vacation.hint}</p>

      {pastMonths > 0 && (
        <label className="col-span-full flex w-full items-start gap-2 text-sm">
          <input type="checkbox" name="creditPastMonths" defaultChecked className="mt-1 accent-[var(--primary)]" />
          <span>
            {interpolate(es.admin.vacation.creditPast, { count: pastMonths })}
            <span className="block text-xs text-ink-soft">{es.admin.vacation.creditPastHint}</span>
          </span>
        </label>
      )}
    </>
  );
}
