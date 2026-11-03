import { useState } from 'react';
import { ErrorNotice } from '../ErrorNotice';
import es, { interpolate, movementCountText } from '../../content/es';
import { apiPost } from '../../lib/apiClient';

/**
 * Shown right after a collaborator is added when the imported spreadsheet has pending information
 * under a similar name: "we have information of X, link it to this collaborator?".
 *
 * @param {{ employee: object, suggestions: Array<{ profile: object }> }} offer
 */
export function LinkSuggestion({ offer, onLinked, onDismiss }) {
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [doneCount, setDoneCount] = useState(null);
  const { employee, suggestions } = offer;
  const labels = es.admin.linkOffer;

  async function link(profile) {
    setBusyKey(profile.key);
    setError(null);
    try {
      const { result } = await apiPost(`/api/import-profiles/${encodeURIComponent(profile.key)}/link`, { employeeId: employee.id });
      setDoneCount(result.movementsCreated);
      onLinked();
    } catch (linkError) {
      setError(linkError);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div role="status" className="mt-5 animate-fade-up rounded-[8px] border border-primary bg-primary-wash p-4 text-sm">
      <p className="font-semibold">{labels.title}</p>

      {doneCount !== null ? (
        <p className="mt-1">{interpolate(labels.done, { movements: movementCountText(doneCount), employee: employee.name })}</p>
      ) : (
        <>
          {suggestions.length > 1 && <p className="mt-1">{interpolate(labels.ambiguous, { employee: employee.name })}</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {suggestions.map(({ profile }) => (
              <li key={profile.key} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {suggestions.length === 1
                    ? interpolate(labels.question, { name: profile.name, movements: movementCountText(profile.movementCount), employee: employee.name })
                    : `${profile.name} (${movementCountText(profile.movementCount)})`}
                </span>
                <button type="button" className="btn" disabled={busyKey !== null} onClick={() => link(profile)}>
                  {labels.yes}
                </button>
              </li>
            ))}
          </ul>
          <ErrorNotice error={error} />
        </>
      )}

      <button type="button" className="mt-3 text-xs text-ink-soft underline hover:text-ink" onClick={onDismiss}>
        {doneCount !== null ? es.history.close : labels.no}
      </button>
    </div>
  );
}
