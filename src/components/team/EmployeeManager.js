import { useMemo, useState } from 'react';
import { EmployeeCreateForm } from './EmployeeCreateForm';
import { EmployeeRow } from './EmployeeRow';
import { LinkSuggestion } from '../admin/LinkSuggestion';
import { ErrorNotice } from '../ErrorNotice';
import { Section } from '../Section';
import { Skeleton } from '../Skeleton';
import { useAuth } from '../../context/AuthContext';
import es, { interpolate } from '../../content/es';
import { filterEmployees, STATUS_FILTERS, teamsOf } from '../../domain/employeeFilters';
import { apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { captureClientException } from '../../lib/clientMonitoring';

function FiltersBar({ filters, teams, onChange }) {
  const labels = es.team.filters;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
      <input
        type="search"
        className="field-input w-full sm:max-w-[260px]"
        placeholder={labels.search}
        aria-label={labels.search}
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
      />
      <label className="field-label">
        {labels.team}
        <select className="field-input" value={filters.team} onChange={(event) => onChange({ ...filters, team: event.target.value })}>
          <option value="">{labels.allTeams}</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        {labels.status}
        <select className="field-input" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
          <option value={STATUS_FILTERS.ACTIVE}>{labels.active}</option>
          <option value={STATUS_FILTERS.INACTIVE}>{labels.inactive}</option>
          <option value={STATUS_FILTERS.ALL}>{labels.all}</option>
        </select>
      </label>
    </div>
  );
}

/**
 * The register of collaborators: filters, one row per person (record, emails, edit, active) and
 * the form to add a new one. After adding someone, it offers to link pending spreadsheet
 * information found under a similar name.
 *
 * @param {{ onImportLinked?: () => void }} props `onImportLinked` runs when imported information is
 *   linked to a collaborator (balances change); defaults to `onChanged`
 */
export function EmployeeManager({ employees, loading, onChanged, onImportLinked }) {
  const { employee: currentEmployee, signedInEmail } = useAuth();
  const [filters, setFilters] = useState({ query: '', team: '', status: STATUS_FILTERS.ACTIVE });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Pending spreadsheet information that looks like the collaborator that was just added
  const [offer, setOffer] = useState(null);
  // Only one card is open at a time; opening another closes the previous one
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const teams = useMemo(() => teamsOf(employees), [employees]);
  const visible = useMemo(() => filterEmployees(employees, filters), [employees, filters]);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (actionError) {
      setError(actionError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patchEmployee = (employee, patch) => run(() => apiPatch(`/api/employees/${encodeURIComponent(employee.id)}`, patch));
  const toggleActive = (employee) => patchEmployee(employee, { active: !employee.active });
  const changeEmails = (employee, emails) => patchEmployee(employee, { emails });

  /** Asks whether the information the spreadsheet had under a similar name belongs to the new collaborator */
  async function offerPendingInformation(newEmployee) {
    try {
      const { suggestions } = await apiGet(`/api/import-profiles/suggestions?name=${encodeURIComponent(newEmployee.name)}`);
      setOffer(suggestions.length ? { employee: newEmployee, suggestions } : null);
    } catch (suggestionError) {
      // The offer is a convenience: the collaborator exists already, so this must not look like a failed creation
      setOffer(null);
      captureClientException(suggestionError, { action: 'import-suggestions' });
    }
  }

  async function createEmployee(payload) {
    let createdEmployee = null;
    const created = await run(async () => {
      const response = await apiPost('/api/employees', payload);
      createdEmployee = response.employee;
    });
    if (created) {
      setCreating(false);
      await offerPendingInformation(createdEmployee);
    }
    return created;
  }

  function openCreate() {
    setError(null);
    setCreating(true);
  }

  const count = visible.length;

  return (
    <Section title={es.team.title}>
      <p className="mb-4 text-xs text-ink-soft">{es.team.description}</p>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FiltersBar filters={filters} teams={teams} onChange={setFilters} />
        <button type="button" className="btn shrink-0" onClick={openCreate}>
          {es.team.addPerson}
        </button>
      </div>
      <p className="mb-2 text-xs font-bold text-ink-soft">{count === 1 ? es.team.countOne : interpolate(es.team.count, { count })}</p>

      {loading && !employees.length && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {!loading && employees.length > 0 && visible.length === 0 && <p className="py-4 text-sm text-ink-soft">{es.team.noResults}</p>}

      {visible.map((employee) => (
        <EmployeeRow
          key={employee.id}
          employee={employee}
          teams={teams}
          isSelf={employee.id === currentEmployee?.id}
          signedInEmail={signedInEmail}
          busy={busy}
          expanded={expandedId === employee.id}
          onToggleExpanded={() => setExpandedId((current) => (current === employee.id ? null : employee.id))}
          onToggleActive={toggleActive}
          onChangeEmails={changeEmails}
          onEditProfile={patchEmployee}
        />
      ))}

      <ErrorNotice error={creating ? null : error} />

      {offer && <LinkSuggestion offer={offer} onLinked={onImportLinked ?? onChanged} onDismiss={() => setOffer(null)} />}

      {creating && <EmployeeCreateForm teams={teams} busy={busy} error={error} onCreate={createEmployee} onCancel={() => setCreating(false)} />}
    </Section>
  );
}
