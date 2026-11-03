// The company works on Costa Rica time; "today" for accruals and cron jobs is that calendar day
export const APP_TIME_ZONE = 'America/Costa_Rica';

/** Today's date as YYYY-MM-DD in the company time zone (the server may run in UTC) */
export function todayInAppTimeZone(now = new Date()) {
  // The en-CA locale formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(now);
}
