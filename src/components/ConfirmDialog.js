import { useEffect, useId, useRef, useState } from 'react';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';
import es from '../content/es';

const TONES = {
  danger: { icon: 'bg-danger-wash text-danger-text', confirm: 'btn-danger-lg' },
  primary: { icon: 'bg-primary-wash text-primary-text', confirm: 'btn' },
};

function DialogIcon({ tone }) {
  const path = tone === 'danger' ? 'M12 8v5m0 3.5h.01M10.3 3.9 2.7 17.2A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z' : 'M5 12.5l4.5 4.5L19 7.5';
  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONES[tone].icon}`} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

/**
 * The app's own confirmation / reason dialog (replaces window.confirm and window.prompt). Mount it
 * only while it is open; `error` shows a failed attempt inside it (the typed reason is kept). With
 * `reasonLabel` it asks for a required text and passes it to `onConfirm(reason)`; without it, it is
 * a plain yes/no. Escape, the backdrop and Cancel call `onCancel` (ignored while `busy`).
 */
export function ConfirmDialog({
  title,
  message,
  tone = 'primary',
  confirmLabel,
  reasonLabel,
  reasonPlaceholder,
  maxLength = 300,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const messageId = useId();
  const firstFieldRef = useRef(null);
  const [reason, setReason] = useState('');
  const asksReason = Boolean(reasonLabel);
  const trimmedReason = reason.trim();
  const canConfirm = !busy && (!asksReason || trimmedReason.length > 0);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (canConfirm) onConfirm(asksReason ? trimmedReason : undefined);
  }

  return (
    <Modal labelledBy={titleId} describedBy={messageId} busy={busy} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-4">
          <DialogIcon tone={tone} />
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <p id={messageId} className="mt-1 text-sm text-ink-soft">
              {message}
            </p>
          </div>
        </div>

        {asksReason && (
          <label className="field-label mt-5">
            {reasonLabel}
            <textarea
              ref={firstFieldRef}
              className="field-input min-h-[96px] resize-none py-2.5"
              rows={3}
              maxLength={maxLength}
              placeholder={reasonPlaceholder}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <span className="num self-end text-[11px] font-normal text-muted">
              {reason.length}/{maxLength}
            </span>
          </label>
        )}

        <ErrorNotice error={error} />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" ref={asksReason ? undefined : firstFieldRef} className="btn-ghost" disabled={busy} onClick={onCancel}>
            {es.dialog.cancel}
          </button>
          <button type="submit" className={TONES[tone].confirm} disabled={!canConfirm}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
