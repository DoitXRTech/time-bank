import { useState } from 'react';
import { EmployeeRecordFields } from './EmployeeRecordFields';
import { readRecordFields } from './employeeForm';
import es, { interpolate, tenureText } from '../../content/es';
import { MAX_EMAILS_PER_EMPLOYEE } from '../../domain/employeeValidation';
import { formatDate, todayIsoDate } from '../../domain/format';
import { ROLE_LIST, ROLES } from '../../domain/movementTypes';
import { tenureOf } from '../../domain/tenure';

function EmailChip({ email, removable, onRemove, disabled }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] bg-chip py-0.5 pl-2 pr-1 text-xs text-ink-soft">
      {email}
      {removable && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(email)}
          aria-label={interpolate(es.admin.emails.remove, { email })}
          className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-soft hover:bg-line hover:text-ink disabled:opacity-50"
        >
          ×
        </button>
      )}
    </span>
  );
}

function AddEmailForm({ onAdd, disabled }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get('email');
    onAdd(email).then((added) => {
      if (added) form.reset();
    });
  }

  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
      <input
        name="email"
        type="email"
        required
        className="field-input !min-h-[36px] w-full max-w-[240px] !text-xs"
        placeholder={es.admin.emails.addPlaceholder}
        aria-label={es.admin.emails.add}
      />
      <button type="submit" className="btn-ghost !min-h-[36px] !px-3 !text-xs" disabled={disabled}>
        {es.admin.emails.add}
      </button>
    </form>
  );
}

/**
 * Edit form of a collaborator. The access (admin / collaborator) is chosen here too; it is locked
 * for your own account, because an admin cannot take away their own admin access.
 */
function EmployeeEditForm({ employee, teams, isSelf, busy, onSave, onCancel }) {
  const labels = es.admin.newEmployee;

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // A disabled select is not part of the form data, so the locked own account sends no role
    const role = data.get('role');
    const saved = await onSave(employee, {
      name: data.get('name'),
      jobTitle: data.get('jobTitle'),
      ...(role ? { role } : {}),
      ...readRecordFields(data),
    });
    if (saved) onCancel();
  }

  return (
    <form className="animate-fade-up" onSubmit={handleSubmit}>
      <div className="form-grid-4">
        <label className="field-label">
          {labels.name}
          <input name="name" type="text" className="field-input" defaultValue={employee.name} required />
        </label>
        <label className="field-label">
          {labels.jobTitle}
          <input name="jobTitle" type="text" className="field-input" defaultValue={employee.jobTitle} />
        </label>
        <label className="field-label">
          {labels.role}
          <select name="role" className="field-input" defaultValue={employee.role} disabled={isSelf} title={isSelf ? es.team.ownAccessLocked : undefined}>
            {ROLE_LIST.map((role) => (
              <option key={role} value={role}>
                {es.admin.roles[role]}
              </option>
            ))}
          </select>
        </label>
        <EmployeeRecordFields employee={employee} teams={teams} />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className="btn" disabled={busy}>
          {es.admin.editEmployee.save}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          {es.admin.editEmployee.cancel}
        </button>
      </div>
    </form>
  );
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-ink-soft">{label}</dt>
      <dd className="text-sm">{children || es.team.details.none}</dd>
    </div>
  );
}

/** The employee record at a glance: hire date with tenure, social security date, employment, schedule */
function RecordDetails({ employee }) {
  const labels = es.team.details;
  const tenure = tenureText(tenureOf(employee.hireDate, todayIsoDate()));
  const schedule = [employee.scheduleStart, employee.scheduleEnd].filter(Boolean).join(' – ');

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5">
      <Detail label={labels.hireDate}>
        {employee.hireDate && (
          <>
            {formatDate(employee.hireDate)}
            {tenure && <span className="block text-xs text-ink-soft">{tenure}</span>}
          </>
        )}
      </Detail>
      <Detail label={labels.socialSecurityDate}>{employee.socialSecurityDate && formatDate(employee.socialSecurityDate)}</Detail>
      <Detail label={labels.employmentType}>{employee.employmentType && es.team.employmentTypes[employee.employmentType]}</Detail>
      <Detail label={labels.schedule}>{schedule}</Detail>
      <Detail label={labels.vacation}>
        {employee.vacationStartDate
          ? interpolate(labels.vacationSince, { date: formatDate(employee.vacationStartDate) })
          : labels.vacationNone}
      </Detail>
    </dl>
  );
}

/** One collaborator of the register: record, emails (add/remove), edit and active toggle */
export function EmployeeRow({ employee, teams, isSelf, signedInEmail, busy, onToggleActive, onChangeEmails, onEditProfile }) {
  const [editing, setEditing] = useState(false);
  const canAddEmail = employee.emails.length < MAX_EMAILS_PER_EMPLOYEE;

  // The email of the current session can never be removed (the server enforces it too)
  const isRemovable = (email) => employee.emails.length > 1 && !(isSelf && email === signedInEmail);

  return (
    <div className="border-b border-divider py-5 first:pt-0 last:border-b-0">
      {editing ? (
        <EmployeeEditForm employee={employee} teams={teams} isSelf={isSelf} busy={busy} onSave={onEditProfile} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {employee.name}
                {employee.role === ROLES.ADMIN && <span className="tag ml-2">{es.admin.adminBadge}</span>}
              </p>
              <p className="text-xs text-ink-soft">{[employee.jobTitle, employee.team].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-ghost !min-h-[36px] !rounded-[6px] !px-3 !text-xs" disabled={busy} onClick={() => setEditing(true)}>
                {es.admin.editEmployee.edit}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={employee.active}
                onClick={() => onToggleActive(employee)}
                className={`min-h-[36px] rounded-[6px] border px-3 text-xs font-medium transition-colors ${
                  employee.active ? 'border-primary bg-primary-wash text-primary-text' : 'border-line bg-chip text-ink-soft'
                }`}
              >
                {employee.active ? es.admin.active : es.admin.inactive}
              </button>
            </div>
          </div>

          <RecordDetails employee={employee} />
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {employee.emails.map((email) => (
          <EmailChip
            key={email}
            email={email}
            removable={isRemovable(email)}
            disabled={busy}
            onRemove={(removed) => onChangeEmails(employee, employee.emails.filter((current) => current !== removed))}
          />
        ))}
      </div>

      {canAddEmail && <AddEmailForm disabled={busy} onAdd={(email) => onChangeEmails(employee, [...employee.emails, email])} />}
    </div>
  );
}
