import es, { interpolate } from '../content/es';
import { balanceTone } from '../domain/balances';
import { formatDate, formatSignedAmount } from '../domain/format';
import { MOVEMENT_UNITS } from '../domain/movementTypes';
import { useApiData } from '../hooks/useApiData';
import { useOnChange } from '../hooks/useOnChange';
import { ErrorNotice } from './ErrorNotice';
import { TableRowsSkeleton } from './Skeleton';
import { TONE_CLASSES } from './toneClasses';

function HistoryRow({ movement }) {
  const isVoided = Boolean(movement.voidedAt);
  const tone = TONE_CLASSES[balanceTone(movement.type, movement.amount)];

  return (
    <tr className={`border-b border-divider last:border-b-0 ${isVoided ? 'opacity-50' : ''}`}>
      <td data-label={es.history.columns.date} className="py-2.5 pr-3 align-top">{formatDate(movement.date)}</td>
      <td data-label={es.history.columns.type} className="py-2.5 pr-3 align-top">
        <span className="tag">{es.movementType[movement.type]}</span>
      </td>
      <td data-label={es.history.columns.amount} className={`num whitespace-nowrap py-2.5 pr-3 align-top font-semibold ${tone} ${isVoided ? 'line-through' : ''}`}>
        {formatSignedAmount(movement.amount, MOVEMENT_UNITS[movement.type])}
      </td>
      <td data-label={es.history.columns.note} className="py-2.5 align-top">
        {movement.note}
        {movement.editCount > 0 && <span className="tag ml-2">{es.history.edited}</span>}
        {isVoided && (
          <span className="block text-xs text-ink-soft">{interpolate(es.history.voidedDetail, { reason: movement.voidReason })}</span>
        )}
      </td>
    </tr>
  );
}

export function HistoryPanel({ employee, onClose }) {
  const { data, error, loading, reload } = useApiData(`/api/movements?employeeId=${encodeURIComponent(employee.id)}`);

  // The history is not polled (it costs a read per movement). The balances are, and a new or
  // voided movement always moves one, so a change in them is the signal to load the history again.
  useOnChange(JSON.stringify(employee.balances), reload);

  const movements = data?.movements ?? [];
  const columns = es.history.columns;

  return (
    <section className="panel mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[22px] font-semibold">{interpolate(es.history.title, { name: employee.name })}</h3>
        {onClose && (
          <button type="button" className="text-sm text-ink-soft underline hover:text-ink" onClick={onClose}>
            {es.history.close}
          </button>
        )}
      </div>

      <ErrorNotice error={error} />

      {loading && !data && <TableRowsSkeleton rows={3} />}

      {!loading && !error && movements.length === 0 && <p className="py-4 text-sm text-ink-soft">{es.history.empty}</p>}

      {movements.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="table-stack w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="th">{columns.date}</th>
                <th className="th">{columns.type}</th>
                <th className="th">{columns.amount}</th>
                <th className="th">{columns.note}</th>
              </tr>
            </thead>
            <tbody className="reveal-rows">
              {movements.map((movement) => (
                <HistoryRow key={movement.id} movement={movement} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
