import { useState } from 'react';
import { ErrorNotice } from '../ErrorNotice';
import { Section } from '../Section';
import { Skeleton } from '../Skeleton';
import es, { interpolate, movementCountText } from '../../content/es';
import { formatSignedAmount } from '../../domain/format';
import { suggestNameMatch } from '../../domain/import/nameMatching';
import { MOVEMENT_TYPE_LIST, MOVEMENT_UNITS } from '../../domain/movementTypes';
import { apiPost } from '../../lib/apiClient';

/** The collaborator whose name looks like the person of the sheet (or like a name they appear under) */
function likelyEmployee(profile, employees) {
  const active = employees.filter((employee) => employee.active);
  const names = active.map((employee) => employee.name);

  for (const sheetName of [profile.name, ...profile.aliases.map((alias) => alias.name)]) {
    const { match } = suggestNameMatch(sheetName, names);
    if (match) return active[names.indexOf(match)];
  }
  return null;
}

function TotalsLine({ totals }) {
  const parts = MOVEMENT_TYPE_LIST.filter((type) => totals[type]).map(
    (type) => `${es.movementType[type]} ${formatSignedAmount(totals[type], MOVEMENT_UNITS[type])}`,
  );
  return <span>{parts.join(' · ')}</span>;
}

function IssueList({ profile }) {
  return (
    <details className="mt-2 text-xs text-ink-soft">
      <summary className="cursor-pointer">{es.admin.pending.issuesToggle}</summary>
      <ul className="mt-1 list-disc pl-5">
        {profile.issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.row}-${index}`}>
            {es.admin.pending.issueCodes[issue.code] ?? issue.code}
            {issue.row ? ` (fila ${issue.row})` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PendingProfileRow({ profile, employees, onChanged }) {
  const suggested = likelyEmployee(profile, employees);
  const [employeeId, setEmployeeId] = useState(suggested?.id ?? '');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const labels = es.admin.pending;

  async function run(kind, action) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (actionError) {
      setError(actionError);
      setBusy(null);
    }
  }

  const link = () => run('link', () => apiPost(`/api/import-profiles/${encodeURIComponent(profile.key)}/link`, { employeeId }));
  const discard = () => {
    if (!window.confirm(interpolate(labels.confirmDiscard, { name: profile.name }))) return;
    run('discard', () => apiPost(`/api/import-profiles/${encodeURIComponent(profile.key)}/discard`));
  };

  return (
    <div className="border-b border-divider py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            {profile.name}
            {profile.needsReview && <span className="tag ml-2">{labels.needsReview}</span>}
            {profile.hiddenInSheet && <span className="tag ml-2">{labels.hiddenInSheet}</span>}
            {profile.issueCount > 0 && <span className="tag ml-2">{interpolate(labels.issuesBadge, { count: profile.issueCount })}</span>}
          </p>
          <p className="text-xs text-ink-soft">
            {movementCountText(profile.movementCount)} · <TotalsLine totals={profile.totals} />
          </p>
          {profile.aliases.length > 0 && (
            <p className="text-xs text-ink-soft">{interpolate(labels.alsoAs, { names: profile.aliases.map((alias) => alias.name).join(', ') })}</p>
          )}
          {profile.needsReview && <p className="text-xs text-ink-soft">{labels.reviewReasons[profile.reviewReason]}</p>}
          {suggested && <p className="text-xs text-primary-text">{interpolate(labels.possible, { name: suggested.name })}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field-input !min-h-[40px] max-w-[220px]"
            aria-label={labels.chooseEmployee}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">{labels.chooseEmployee}</option>
            {employees
              .filter((employee) => employee.active)
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
          </select>
          <button type="button" className="btn" disabled={!employeeId || busy !== null} onClick={link}>
            {busy === 'link' ? labels.linking : labels.link}
          </button>
          <button type="button" className="btn-ghost" disabled={busy !== null} onClick={discard}>
            {labels.discard}
          </button>
        </div>
      </div>

      {profile.issueCount > 0 && <IssueList profile={profile} />}
      <ErrorNotice error={error} />
    </div>
  );
}

/**
 * People found in the imported spreadsheet that are not tied to a collaborator yet. Each one can
 * be linked to a collaborator (the likeliest by name is preselected) or discarded.
 */
export function PendingProfiles({ profiles, employees, loading, onChanged }) {
  return (
    <Section title={es.admin.pending.title}>
      <p className="mb-4 text-xs text-ink-soft">{es.admin.pending.description}</p>

      {loading && !profiles.length && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {!loading && profiles.length === 0 && <p className="py-2 text-sm text-ink-soft">{es.admin.pending.empty}</p>}

      {profiles.map((profile) => (
        <PendingProfileRow key={profile.key} profile={profile} employees={employees} onChanged={onChanged} />
      ))}
    </Section>
  );
}
