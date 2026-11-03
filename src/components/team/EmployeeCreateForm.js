import { useState } from 'react';
import { EmployeeRecordFields } from './EmployeeRecordFields';
import { readRecordFields } from './employeeForm';
import es from '../../content/es';
import { ROLE_LIST, ROLES } from '../../domain/movementTypes';

/**
 * Form to add a collaborator: account data (name, job title, first email, access) plus the
 * employee record. `onCreate(payload)` resolves to true when it worked, which clears the form.
 */
export function EmployeeCreateForm({ teams, busy, onCreate }) {
  // The vacation fields keep their own state: remounting them clears it with the rest of the form
  const [formKey, setFormKey] = useState(0);
  const labels = es.admin.newEmployee;

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const created = await onCreate({
      name: data.get('name'),
      jobTitle: data.get('jobTitle'),
      emails: [data.get('email')],
      role: data.get('role'),
      ...readRecordFields(data),
    });
    if (created) {
      form.reset();
      setFormKey((key) => key + 1);
    }
  }

  return (
    <form key={formKey} className="mt-5 flex flex-col gap-1" onSubmit={handleSubmit}>
      <div className="form-grid-4">
        <label className="field-label">
          {labels.name}
          <input name="name" type="text" className="field-input" placeholder={labels.namePlaceholder} required />
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
      <p className="mt-2 text-xs text-ink-soft">{es.admin.vacation.hint}</p>
      <div className="mt-3">
        <button type="submit" className="btn-ghost" disabled={busy}>
          {labels.add}
        </button>
      </div>
    </form>
  );
}
