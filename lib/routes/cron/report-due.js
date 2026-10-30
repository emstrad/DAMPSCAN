/**
 * GET /api/cron/report-due
 *
 * Rings for survey reports past their 24 hours (lib/report-late.js). The
 * hosting plan runs its own schedules once a day, so this is called hourly
 * by the GitHub workflow report-due.yml; the morning and evening runs call
 * the same check too, in case that is not set up.
 *
 * The same hourly run lets pencilled times past their 48 hours lapse
 * (lib/pencils.js) and scans the inbox for the Scheduling board
 * (lib/mail-scan.js), and nudges enquiries nobody has touched in two hours
 * (lib/enquiry-nudge.js). Each runs on its own, so one failing never stops the others.
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { alertLateReports } from '../../report-late.js';
import { expirePencils } from '../../pencils.js';
import { scanMail } from '../../mail-scan.js';
import { nudgeUntouched } from '../../enquiry-nudge.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  const run = (name, fn) => fn().catch((err) => { console.error(`${name} failed:`, err.message); return { failed: true }; });
  /* The inbox scan first, so an email just answered is not nudged as untouched. */
  const mail = await run('mail scan', () => scanMail());
  const [reports, pencils, nudges] = await Promise.all([run('report-due', alertLateReports), run('pencils', async () => ({ lapsed: await expirePencils() })), run('nudges', () => nudgeUntouched())]);
  /* Any step failing turns the hourly workflow red, so it is seen, after every step has had its turn. */
  const failed = Object.entries({ mail, reports, pencils, nudges }).filter(([, v]) => v && v.failed).map(([k]) => k);
  if (failed.length) return json(res, 500, { ok: false, error: 'report_due_failed', failed, reports, pencils, mail, nudges });
  json(res, 200, { ok: true, ...reports, pencils, mail, nudges });
}
