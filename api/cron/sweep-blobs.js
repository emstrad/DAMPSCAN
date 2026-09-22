/**
 * GET /api/cron/sweep-blobs
 *
 * Runs the orphan sweep on the schedule in vercel.json. Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`, and that header is the only thing that
 * gets past the door: with no secret configured the route refuses everyone,
 * including Vercel, rather than run a deletion job on an open URL.
 *
 * The same sweep is available by hand as `npm run sweep-blobs`, which is how
 * to try it with --dry-run before trusting it to a schedule.
 */
import { json, requireMethod } from '../../lib/http.js';
import { requireCron } from '../../lib/cron-guard.js';
import { sweepOrphans } from '../../lib/sweep.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;

  const result = await sweepOrphans();
  if (!result.ok) console.warn('blob sweep did not run:', result.reason);
  else console.log(`blob sweep: scanned ${result.scanned}, removed ${result.removed} orphans`);
  json(res, result.ok ? 200 : 500, result);
}
