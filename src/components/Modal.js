import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shell of every dialog of the app: dimmed backdrop, centered card, Escape / backdrop click to
 * close (ignored while `busy`), page scroll locked and focus given back to what opened it.
 * Mount it only while it is open. It renders in a portal on <body>: inside a page section (which
 * animates) a fixed backdrop would only cover that section.
 *
 * @param {{ labelledBy: string, describedBy?: string, size?: 'sm' | 'lg', busy?: boolean, onClose: () => void }} props
 */
export function Modal({ labelledBy, describedBy, size = 'sm', busy = false, onClose, children }) {
  // Read while rendering, before a child focuses its own field
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [opener]);

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
      onKeyDown={(event) => event.key === 'Escape' && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`dialog-card ${size === 'lg' ? 'dialog-card-lg' : ''}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
