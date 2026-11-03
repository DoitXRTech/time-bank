import { useState } from 'react';
import { ErrorNotice } from '../ErrorNotice';
import { Section } from '../Section';
import es, { interpolate } from '../../content/es';
import { formatDate } from '../../domain/format';
import { apiPost } from '../../lib/apiClient';

function ImportSummary({ result, saved }) {
  const labels = es.admin.import;
  const merged = result.profiles.flatMap((profile) => profile.aliases.map((alias) => ({ alias: alias.name, name: profile.name })));
  const issueTotal = Object.values(result.issueCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mt-5 animate-fade-up rounded-[8px] bg-chip p-4 text-sm">
      <p className="font-semibold">{saved ? labels.savedTitle : labels.previewTitle}</p>
      <p className="mt-1">{interpolate(labels.summary, { people: result.people, movements: result.movements })}</p>
      <p className="mt-1 text-xs text-ink-soft">{interpolate(labels.openingDate, { date: formatDate(result.openingDate) })}</p>

      {merged.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-ink-soft">{labels.mergedTitle}</p>
          <ul className="mt-1 list-disc pl-5">
            {merged.map(({ alias, name }) => (
              <li key={`${alias}-${name}`}>{interpolate(labels.mergedItem, { alias, name })}</li>
            ))}
          </ul>
        </div>
      )}

      {result.needReview > 0 && <p className="mt-3">{interpolate(labels.needReview, { count: result.needReview })}</p>}
      {result.holidayDaysOwed > 0 && (
        <p className="mt-1">
          {result.holidayDaysOwed === 1 && result.peopleWithHolidaysOwed === 1
            ? labels.holidaysOwedOne
            : interpolate(labels.holidaysOwed, { days: result.holidayDaysOwed, people: result.peopleWithHolidaysOwed })}
        </p>
      )}
      {result.hiddenInSheet > 0 && <p className="mt-1">{interpolate(labels.hiddenInSheet, { count: result.hiddenInSheet })}</p>}
      {issueTotal > 0 && <p className="mt-1">{interpolate(labels.issues, { count: issueTotal })}</p>}
      {saved && <p className="mt-3 text-primary-text">{interpolate(labels.saved, saved)}</p>}
    </div>
  );
}

/**
 * Loads the team's spreadsheet from its Google Sheets link. "Revisar" shows what would be saved
 * without writing; "Guardar para asociar" saves every person as pending (not tied to any
 * collaborator yet, see PendingProfiles).
 */
export function ImportPanel({ onStaged }) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const labels = es.admin.import;

  async function run(kind) {
    setBusy(kind);
    setError(null);
    try {
      const { result: response } = await apiPost('/api/imports', { sheetUrl, dryRun: kind === 'review' });
      setResult(response);
      setSaved(kind === 'save' ? response.saved : null);
      if (kind === 'save') onStaged();
    } catch (importError) {
      setError(importError);
    } finally {
      setBusy(null);
    }
  }

  function handleChange(event) {
    setSheetUrl(event.target.value);
    // A new link means the reviewed summary is about something else
    setResult(null);
    setSaved(null);
  }

  return (
    <Section title={labels.title}>
      <p className="mb-4 text-xs text-ink-soft">{labels.description}</p>

      <label className="field-label">
        {labels.linkLabel}
        <input
          type="url"
          className="field-input"
          placeholder={labels.linkPlaceholder}
          value={sheetUrl}
          onChange={handleChange}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" disabled={!sheetUrl.trim() || busy !== null} onClick={() => run('review')}>
          {busy === 'review' ? labels.reviewing : labels.review}
        </button>
        <button type="button" className="btn" disabled={!result || saved !== null || busy !== null} onClick={() => run('save')}>
          {busy === 'save' ? labels.saving : labels.save}
        </button>
      </div>

      <ErrorNotice error={error} />
      {result && <ImportSummary result={result} saved={saved} />}
    </Section>
  );
}
