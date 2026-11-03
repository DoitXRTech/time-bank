import { useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice } from '../ErrorNotice';
import { Section } from '../Section';
import { TableRowsSkeleton } from '../Skeleton';
import { requestSummary } from './requestSummary';
import es, { interpolate } from '../../content/es';
import { formatDate } from '../../domain/format';
import { REQUEST_STATUSES } from '../../domain/requestTypes';
import { apiPost } from '../../lib/apiClient';

const STATUS_TONES = {
  [REQUEST_STATUSES.APPROVED]: 'text-primary-text',
  [REQUEST_STATUSES.REJECTED]: 'text-danger-text',
};

function MyRequestRow({ request, busy, onCancel }) {
  const labels = es.requests;
  const isPending = request.status === REQUEST_STATUSES.PENDING;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-medium">
          {es.movementType[request.kind]} · {requestSummary(request)}
          <span className={`tag ml-2 ${STATUS_TONES[request.status] ?? ''}`}>{labels.statuses[request.status]}</span>
        </p>
        {request.note && <p className="text-xs text-ink-soft">{request.note}</p>}
        <p className="text-xs text-ink-soft">{interpolate(labels.sentOn, { date: formatDate(request.createdAt.slice(0, 10)) })}</p>
        {request.status === REQUEST_STATUSES.REJECTED && (
          <p className="text-xs text-danger-text">{interpolate(labels.rejectedBecause, { reason: request.decisionNote })}</p>
        )}
      </div>
      {isPending && (
        <button type="button" className="btn-ghost !min-h-[36px] !rounded-[6px] !px-3 !text-xs" disabled={busy} onClick={() => onCancel(request.id)}>
          {labels.cancel}
        </button>
      )}
    </div>
  );
}

/** What the signed-in person has asked for, newest first, with the answer of the admins */
export function MyRequests({ requests, loading, error, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  async function handleCancel() {
    const requestId = cancellingId;
    setCancellingId(null);
    setBusyId(requestId);
    setCancelError(null);
    try {
      await apiPost(`/api/requests/${encodeURIComponent(requestId)}/cancel`);
      onChanged();
    } catch (cancelFailure) {
      setCancelError(cancelFailure);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section title={es.requests.mineTitle}>
      <ErrorNotice error={error ?? cancelError} />
      {loading && !requests.length && <TableRowsSkeleton rows={2} />}
      {!loading && !error && requests.length === 0 && <p className="py-2 text-sm text-ink-soft">{es.requests.mineEmpty}</p>}
      {requests.map((request) => (
        <MyRequestRow key={request.id} request={request} busy={busyId === request.id} onCancel={setCancellingId} />
      ))}
      {cancellingId && (
        <ConfirmDialog
          tone="danger"
          title={es.requests.cancelDialog.title}
          message={es.requests.cancelDialog.message}
          confirmLabel={es.requests.cancelDialog.confirm}
          onConfirm={handleCancel}
          onCancel={() => setCancellingId(null)}
        />
      )}
    </Section>
  );
}
