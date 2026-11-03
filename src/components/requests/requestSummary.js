import es, { interpolate } from '../../content/es';
import { formatAmount, formatDate, formatMonth } from '../../domain/format';
import { MOVEMENT_UNITS } from '../../domain/movementTypes';
import { REQUEST_KINDS } from '../../domain/requestTypes';

/** "5 h de octubre de 2026" / "3 d desde el 17 nov 2026": what a request asks for, in one line */
export function requestSummary(request) {
  const amount = formatAmount(request.amount, MOVEMENT_UNITS[request.kind]);
  if (request.kind === REQUEST_KINDS.OVERTIME) {
    return interpolate(es.requests.summary.overtime, { amount, month: formatMonth(request.period) });
  }
  return interpolate(es.requests.summary.vacation, { amount, date: formatDate(request.date) });
}
