import { useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice } from '../ErrorNotice';
import { requestSummary } from '../requests/requestSummary';
import { Section } from '../Section';
import { TableRowsSkeleton } from '../Skeleton';
import es, { interpolate } from '../../content/es';
import { formatDate, formatSignedAmount } from '../../domain/format';
import { MOVEMENT_UNITS } from '../../domain/movementTypes';
import { MAX_DECISION_NOTE_LENGTH, REQUEST_KINDS } from '../../domain/requestTypes';
import { apiPost } from '../../lib/apiClient';

/** A vacation that asks for more days than the person has still gets decided by a human, but is flagged */
function exceedsVacationBalance(request, employee) {
  return request.kind === REQUEST_KINDS.VACATION && Boolean(employee) && request.amount > employee.balances.vacation;
}

function RequestRow({ request, employee, busy, onApprove, onReject }) {
  const labels = es.requests.inbox;

  return (
    <tr className="border-b border-divider last:border-b-0">
      <td data-label={labels.columns.employee} className="py-2.5 pr-3 align-top">
        {employee?.name ?? '?'}
        <span className="block text-xs text-ink-soft">{formatDate(request.createdAt.slice(0, 10))}</span>
      </td>
      <td data-label={labels.columns.request} className="py-2.5 pr-3 align-top">
        <span className="tag">{es.movementType[request.kind]}</span>
        <span className="mt-1 block font-semibold">{requestSummary(request)}</span>
        {exceedsVacationBalance(request, employee) && <span className="tag mt-1 text-danger-text">{labels.exceedsBalance}</span>}
      </td>
      <td data-label={labels.columns.balance} className="num whitespace-nowrap py-2.5 pr-3 align-top">
        {employee ? formatSignedAmount(employee.balances[request.kind], MOVEMENT_UNITS[request.kind]) : '—'}
      </td>
      <td data-label={labels.columns.note} className="py-2.5 pr-3 align-top">{request.note}</td>
      <td className="py-2.5 align-top">
        <div className="flex gap-2">
          <button type="button" className="btn !min-h-[36px] !rounded-[6px] !px-3 !text-xs" disabled={busy} onClick={() => onApprove(request.id)}>
            {labels.approve}
          </button>
          <button type="button" className="btn-danger" disabled={busy} onClick={() => onReject(request)}>
            {labels.reject}
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * The inbox of the admins: what collaborators asked for and nobody has decided yet. Approving
 * registers the movement (and moves the balance); rejecting asks for a reason the person reads.
 */
export function RequestsInbox({ requests, employees, loading, error, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const labels = es.requests.inbox;

  async function decide(requestId, action, body) {
    setBusyId(requestId);
    setActionError(null);
    try {
      await apiPost(`/api/requests/${encodeURIComponent(requestId)}/${action}`, body);
      onChanged();
      return true;
    } catch (decisionError) {
      setActionError(decisionError);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const approve = (requestId) => decide(requestId, 'approve');
  const openReject = (request) => {
    setActionError(null);
    setRejecting(request);
  };
  const confirmReject = async (reason) => {
    if (await decide(rejecting.id, 'reject', { reason })) setRejecting(null);
  };
  const rejectingEmployee = rejecting && employeesById.get(rejecting.employeeId);

  return (
    <Section title={labels.title}>
      <p className="mb-4 text-xs text-ink-soft">{labels.description}</p>
      <ErrorNotice error={error ?? (rejecting ? null : actionError)} />

      {loading && !requests.length && <TableRowsSkeleton rows={2} />}
      {!loading && !error && requests.length === 0 && <p className="py-2 text-sm text-ink-soft">{labels.empty}</p>}

      {requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-stack w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="th">{labels.columns.employee}</th>
                <th className="th">{labels.columns.request}</th>
                <th className="th">{labels.columns.balance}</th>
                <th className="th">{labels.columns.note}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="reveal-rows">
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  employee={employeesById.get(request.employeeId)}
                  busy={busyId === request.id}
                  onApprove={approve}
                  onReject={openReject}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && (
        <ConfirmDialog
          tone="danger"
          title={labels.rejectDialog.title}
          message={interpolate(labels.rejectDialog.message, { name: rejectingEmployee?.name ?? '?', summary: requestSummary(rejecting) })}
          reasonLabel={labels.rejectDialog.reasonLabel}
          reasonPlaceholder={labels.rejectDialog.reasonPlaceholder}
          confirmLabel={labels.rejectDialog.confirm}
          maxLength={MAX_DECISION_NOTE_LENGTH}
          busy={busyId === rejecting.id}
          error={actionError}
          onConfirm={confirmReject}
          onCancel={() => setRejecting(null)}
        />
      )}
    </Section>
  );
}
