import { useEffect, useRef } from 'react';

/**
 * Calls `onChange` when `value` differs from the one the screen last saw. Not for the first value:
 * whatever was loaded with the screen is already current, and `null`/`undefined` means "not
 * loaded yet", so the first real value only becomes the baseline. For chaining a reload to another
 * resource that refreshes by itself (e.g. the history reloads when the polled balances change).
 */
export function useOnChange(value, onChange) {
  const seenValue = useRef(value);

  useEffect(() => {
    if (seenValue.current === value) return;
    const wasLoaded = seenValue.current !== null && seenValue.current !== undefined;
    seenValue.current = value;
    if (wasLoaded) onChange();
  }, [value, onChange]);
}
