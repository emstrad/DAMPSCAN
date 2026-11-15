/**
 * /api/cron/:task
 *
 * Every scheduled job behind one function. Each one used to be its own file,
 * and each file is a serverless function, which the hosting plan counts and
 * caps; the public quote page needed one more. The paths in vercel.json are
 * unchanged, and each handler still checks CRON_SECRET for itself.
 */
import { json, actionFrom } from '../../lib/http.js';
import digest from '../../lib/routes/cron/digest.js';
import evening from '../../lib/routes/cron/evening.js';
import reportDue from '../../lib/routes/cron/report-due.js';
import sweepBlobs from '../../lib/routes/cron/sweep-blobs.js';
import texts from '../../lib/routes/cron/texts.js';

export const config = { runtime: 'nodejs' };

const TASKS = { digest, evening, 'sweep-blobs': sweepBlobs, 'report-due': reportDue, texts };

export default async function handler(req, res) {
  const task = TASKS[actionFrom(req.url)];
  if (!task) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  return task(req, res);
}
