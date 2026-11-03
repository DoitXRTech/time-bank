import { VacationStartFields } from '../admin/VacationStartFields';
import es from '../../content/es';
import { EMPLOYMENT_TYPE_LIST } from '../../domain/employmentTypes';

const TEAM_OPTIONS_ID = 'team-options';

/**
 * The employee record fields shared by the "add" and "edit" forms: team, hire date, social security
 * date, employment type, schedule and the vacation accrual start. Meant to sit inside a
 * `.form-grid-4`. `teams` feeds the suggestions of the team field (existing teams, free text allowed).
 */
export function EmployeeRecordFields({ employee = {}, teams = [] }) {
  const labels = es.team.fields;

  return (
    <>
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
        <input name="hireDate" type="date" className="field-input" defaultValue={employee.hireDate ?? ''} />
      </label>
      <label className="field-label">
        {labels.socialSecurityDate}
        <input name="socialSecurityDate" type="date" className="field-input" defaultValue={employee.socialSecurityDate ?? ''} />
      </label>
      <label className="field-label">
        {labels.employmentType}
        <select name="employmentType" className="field-input" defaultValue={employee.employmentType ?? ''}>
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
      <VacationStartFields initialDate={employee.vacationStartDate ?? ''} hasStartDate={Boolean(employee.vacationStartDate)} />
    </>
  );
}
