import { useId } from 'react';
import { EmployeeRecordFields } from './EmployeeRecordFields';
import { readRecordFields } from './employeeForm';
import { ErrorNotice } from '../ErrorNotice';
import { Modal } from '../Modal';
import es from '../../content/es';
import { ROLE_LIST, ROLES } from '../../domain/movementTypes';

/**
 * Dialog to add a person: account data (name, job title, first email, access) plus the employee
 * record. Mount it only while it is open. `onCreate(payload)` resolves to true when it worked (the
 * parent then closes it); on failure it stays open with `error`, keeping what was typed.
 */
export function EmployeeCreateForm({ teams, busy, error, onCreate, onCancel }) {
  const titleId = useId();
  const descriptionId = useId();
  const labels = es.admin.newEmployee;

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onCreate({
      name: data.get('name'),
      jobTitle: data.get('jobTitle'),
      emails: [data.get('email')],
      role: data.get('role'),
      ...readRecordFields(data),
    });
  }

  return (
    <Modal size="lg" labelledBy={titleId} describedBy={descriptionId} busy={busy} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <h2 id={titleId} className="text-lg font-semibold">
          {labels.title}
        </h2>
        <p id={descriptionId} className="mb-5 mt-1 text-sm text-ink-soft">
          {labels.description}
        </p>

        <div className="form-grid-4">
          <label className="field-label">
            {labels.name}
            <input name="name" type="text" className="field-input" placeholder={labels.namePlaceholder} required autoFocus />
          </label>
          <label className="field-label">
            {labels.jobTitle}
            <input name="jobTitle" type="text" className="field-input" placeholder={labels.jobTitlePlaceholder} />
          </label>
          <label className="field-label">
            {labels.email}
            <input name="email" type="email" className="field-input" placeholder={labels.emailPlaceholder} required />
          </label>
          <label className="field-label">
            {labels.role}
            <select name="role" className="field-input" defaultValue={ROLES.MEMBER}>
              {ROLE_LIST.map((role) => (
                <option key={role} value={role}>
                  {es.admin.roles[role]}
                </option>
              ))}
            </select>
          </label>
          <EmployeeRecordFields teams={teams} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">{es.admin.vacation.hint}</p>

        <ErrorNotice error={error} />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
            {es.dialog.cancel}
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {labels.add}
          </button>
        </div>
      </form>
    </Modal>
  );
}
