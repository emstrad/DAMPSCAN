/**
 * GET /api/cron/digest
 *
 * The morning digest, on the schedule in vercel.json, behind the same bearer
 * secret as every cron route. One push per business with something to say;
 * see lib/digest.js for what that is.
 */
import { json, requireMethod } from '../../lib/http.js';
import { requireCron } from '../../lib/cron-guard.js';
import { runDigest } from '../../lib/digest.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  try {
    const result = await runDigest();
    console.log(`digest: ${result.sent.length} pushed`);
    json(res, 200, result);
  } catch (err) {
    console.error('digest failed:', err.message);
    json(res, 500, { ok: false, error: 'digest_failed' });
  }
}
