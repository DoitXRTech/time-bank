import { Fragment, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice } from '../ErrorNotice';
import { Section } from '../Section';
import { TableRowsSkeleton } from '../Skeleton';
import { MovementEditForm } from './MovementEditForm';
import es, { interpolate } from '../../content/es';
import { balanceTone } from '../../domain/balances';
import { formatDate, formatSignedAmount } from '../../domain/format';
import { MAX_VOID_REASON_LENGTH, MOVEMENT_UNITS } from '../../domain/movementTypes';
import { apiPost } from '../../lib/apiClient';
import { TONE_CLASSES } from '../toneClasses';

const FILTER_RECENT = '';
export const RECENT_LIMIT = 15;
export const EMPLOYEE_HISTORY_LIMIT = 200;

/** URL for the list: the latest movements of the team, or the history of one person */
export function movementsUrl(employeeId) {
  return employeeId
    ? `/api/movements?employeeId=${encodeURIComponent(employeeId)}&limit=${EMPLOYEE_HISTORY_LIMIT}`
    : `/api/movements?limit=${RECENT_LIMIT}`;
}

function MovementRow({ movement, employeeName, busy, onEdit, onVoid }) {
  const isVoided = Boolean(movement.voidedAt);
  const tone = TONE_CLASSES[balanceTone(movement.type, movement.amount)];

  return (
    <tr className={`border-b border-divider last:border-b-0 ${isVoided ? 'opacity-50' : ''}`}>
      <td data-label={es.admin.recentColumns.date} className="py-2.5 pr-3 align-top">{formatDate(movement.date)}</td>
      <td data-label={es.admin.recentColumns.employee} className="py-2.5 pr-3 align-top">{employeeName}</td>
      <td data-label={es.admin.recentColumns.type} className="py-2.5 pr-3 align-top">
        <span className="tag">{es.movementType[movement.type]}</span>
      </td>
      <td data-label={es.admin.recentColumns.amount} className={`num whitespace-nowrap py-2.5 pr-3 align-top font-semibold ${tone} ${isVoided ? 'line-through' : ''}`}>
        {formatSignedAmount(movement.amount, MOVEMENT_UNITS[movement.type])}
      </td>
      <td data-label={es.admin.recentColumns.note} className="py-2.5 pr-3 align-top">
        {movement.note}
        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
          {movement.source === 'import' && <span className="tag">{es.admin.badges.imported}</span>}
          {movement.source === 'request' && <span className="tag">{es.admin.badges.request}</span>}
          {movement.source === 'adjustment' && <span className="tag">{es.admin.badges.adjustment}</span>}
          {movement.editCount > 0 && <span className="tag">{es.admin.badges.edited}</span>}
        </span>
        {isVoided && (
          <span className="block text-xs text-ink-soft">{interpolate(es.history.voidedDetail, { reason: movement.voidReason })}</span>
        )}
      </td>
      <td className="py-2.5 align-top">
        {!isVoided && (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !min-h-[36px] !rounded-[6px] !px-3 !text-xs" disabled={busy} onClick={() => onEdit(movement.id)}>
              {es.admin.editMovement.edit}
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => onVoid(movement.id)}>
              {es.admin.void}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Movements of the team (latest ones) or of one person, with the two ways to fix a mistake:
 * edit it (re-balances, keeps the previous values) or void it (reverses it, keeps who and why).
 */
export function RecentMovements({ movements, employees, loading, filterEmployeeId, onFilterChange, onChanged }) {
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [voidingId, setVoidingId] = useState(null);
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));
  const columns = es.admin.recentColumns;

  function openVoid(movementId) {
    setError(null);
    setVoidingId(movementId);
  }

  async function handleVoid(reason) {
    const movementId = voidingId;
    setBusyId(movementId);
    setError(null);
    try {
      await apiPost(`/api/movements/${encodeURIComponent(movementId)}/void`, { reason });
      onChanged();
      setVoidingId(null);
    } catch (voidError) {
      setError(voidError);
    } finally {
      setBusyId(null);
    }
  }

  function handleEdited() {
    setEditingId(null);
    onChanged();
  }

  return (
    <Section title={es.admin.recentTitle}>
      <label className="field-label mb-4 max-w-[320px]">
        {es.admin.movementsFilter}
        <select className="field-input" value={filterEmployeeId} onChange={(event) => onFilterChange(event.target.value)}>
          <option value={FILTER_RECENT}>{es.admin.movementsFilterRecent}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>

      <ErrorNotice error={voidingId ? null : error} />

      {loading && !movements.length && <TableRowsSkeleton rows={4} />}

      {!loading && movements.length === 0 && (
        <p className="py-4 text-sm text-ink-soft">{es.admin.recentEmpty}</p>
      )}

      {movements.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-stack w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="th">{columns.date}</th>
                <th className="th">{columns.employee}</th>
                <th className="th">{columns.type}</th>
                <th className="th">{columns.amount}</th>
                <th className="th">{columns.note}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="reveal-rows">
              {movements.map((movement) => (
                <Fragment key={movement.id}>
                  <MovementRow
                    movement={movement}
                    employeeName={employeeNames.get(movement.employeeId) ?? '?'}
                    busy={busyId === movement.id}
                    onEdit={setEditingId}
                    onVoid={openVoid}
                  />
                  {editingId === movement.id && (
                    <tr>
                      <td colSpan={6} className="pb-4">
                        <MovementEditForm movement={movement} employees={employees} onSaved={handleEdited} onCancel={() => setEditingId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filterEmployeeId && movements.length >= EMPLOYEE_HISTORY_LIMIT && (
        <p className="mt-3 text-xs text-ink-soft">{interpolate(es.admin.movementsLimitHint, { count: EMPLOYEE_HISTORY_LIMIT })}</p>
      )}
      {voidingId && (
        <ConfirmDialog
          tone="danger"
          title={es.admin.voidDialog.title}
          message={es.admin.voidDialog.message}
          reasonLabel={es.admin.voidDialog.reasonLabel}
          reasonPlaceholder={es.admin.voidDialog.reasonPlaceholder}
          confirmLabel={es.admin.voidDialog.confirm}
          maxLength={MAX_VOID_REASON_LENGTH}
          busy={busyId === voidingId}
          error={error}
          onConfirm={handleVoid}
          onCancel={() => setVoidingId(null)}
        />
      )}
    </Section>
  );
}
