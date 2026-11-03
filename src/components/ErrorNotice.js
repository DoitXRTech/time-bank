import { getErrorMessage } from '../lib/errorMessages';

export function ErrorNotice({ error }) {
  if (!error) return null;
  return (
    <p role="alert" className="py-3 text-sm text-danger-text">
      {getErrorMessage(error)}
    </p>
  );
}
