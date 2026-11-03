import { timingSafeEqual } from 'node:crypto';
import { AuthenticationError } from './errors';

/**
 * Vercel Cron calls the route with `Authorization: Bearer <CRON_SECRET>`. Without the secret
 * configured the job refuses to run (500) instead of leaving a public endpoint open.
 */
export function assertCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not configured');

  const provided = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  // Compare in constant time; timingSafeEqual requires equal lengths
  const matches = provided.length === expected.length && timingSafeEqual(provided, expected);
  if (!matches) throw new AuthenticationError('Invalid cron credentials');
}
