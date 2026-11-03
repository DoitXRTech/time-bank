import { todayInAppTimeZone } from '../../../../lib/appDate';
import { assertCronRequest } from '../../../../lib/cron-auth';
import { handleApiError, routeByMethod } from '../../../../lib/error-handler';
import { accrueAllEmployees } from '../../../../lib/services/vacationAccrualService';

/**
 * Daily job (see vercel.json): credits 1 vacation day per complete month to every active employee
 * with a start date. Idempotent, so running it twice or late only credits what is missing.
 * Answers 500 when any employee failed so the cron run shows up as failed.
 */
async function accrue(req, res) {
  assertCronRequest(req);
  const summary = await accrueAllEmployees(todayInAppTimeZone());
  return res.status(summary.failedEmployeeIds.length ? 500 : 200).json(summary);
}

// Not behind withAuth: it is called by Vercel Cron with the CRON_SECRET, not by a signed-in user
export default async function handler(req, res) {
  try {
    await routeByMethod({ GET: accrue, POST: accrue })(req, res);
  } catch (error) {
    handleApiError(error, req, res);
  }
}
