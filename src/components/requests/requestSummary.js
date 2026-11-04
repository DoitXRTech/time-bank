import es, { interpolate } from '../../content/es';
import { formatAmount, formatDate, formatMonth } from '../../domain/format';
import { MOVEMENT_UNITS } from '../../domain/movementTypes';
import { REQUEST_ACTIONS, REQUEST_KINDS, requestAction, requestOptionId } from '../../domain/requestTypes';

/** "Canjear un feriado": what kind of request it is (the label of its form option) */
export function requestLabel(request) {
  return es.requests.options[requestOptionId(request)]?.label ?? es.movementType[request.kind];
}

/**
 * What a request asks for, in one line: "5 h de octubre de 2026" (a report), "4 h el 12 nov 2026"
 * (a day taken) or "3 d desde el 17 nov 2026" (vacation, which can span several days).
 */
export function requestSummary(request) {
  const amount = formatAmount(request.amount, MOVEMENT_UNITS[request.kind]);
  const { summary } = es.requests;

  if (requestAction(request) === REQUEST_ACTIONS.REPORT) {
    return interpolate(summary.report, { amount, month: formatMonth(request.period) });
  }
  const template = request.kind === REQUEST_KINDS.VACATION ? summary.redeemFrom : summary.redeem;
  return interpolate(template, { amount, date: formatDate(request.date) });
}
