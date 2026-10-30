/**
 * GET /api/cron/digest
 *
 * The morning digest, on the schedule in vercel.json, behind the same bearer
 * secret as every cron route. One push per business with something to say;
 * see lib/digest.js for what that is. It first runs any switched-on Revolut
 * feed, so the digest already knows about yesterday's payments, and on a
 * plan that limits scheduled jobs this needs no schedule of its own. After
 * the digest it sends the clock-driven alerts (half-finished forms, overdue
 * invoices, and on a Monday the weekly summary), for the same reason.
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { rightHour } from './london-hour.js';
import { runDigest } from '../../digest.js';
import { alertPartials, alertOverdue } from '../../daily-alerts.js';
import { runWeekly } from '../../weekly-summary.js';
import { alertLateReports, alertUnpaidSurveys } from '../../report-late.js';
import { alertFridayMoney } from '../../friday-money.js';
import { syncFeeds } from '../../bank/revolut.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  /* Scheduled at two UTC hours; only the one on London's 06 o'clock hour runs (./london-hour.js). */
  if (!rightHour(req, 6)) return json(res, 200, { ok: true, skipped: 'not this hour in London' });
  try {
    const feeds = await syncFeeds().catch((err) => ({ error: err.message }));
    /* The owners turned the "Good morning" push off; MORNING_DIGEST=on brings it back. */
    const result = { ...(process.env.MORNING_DIGEST === 'on' ? await runDigest() : { sent: [], off: true }), feeds };
    /* Each alert set on its own, so one failing does not lose the others. */
    const safe = (p) => p.catch((err) => ({ error: err.message }));
    result.alerts = { partials: await safe(alertPartials()), overdue: await safe(alertOverdue()), weekly: await safe(runWeekly()), reports: await safe(alertLateReports()), unpaid: await safe(alertUnpaidSurveys()), friday: await safe(alertFridayMoney()) };
    console.log(`digest: ${result.sent.length} pushed`);
    json(res, 200, result);
  } catch (err) {
    console.error('digest failed:', err.message);
    json(res, 500, { ok: false, error: 'digest_failed' });
  }
}
