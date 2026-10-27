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
 * (lib/mail-scan.js). Each runs on its own, so one failing never stops the others.
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { alertLateReports } from '../../report-late.js';
import { expirePencils } from '../../pencils.js';
import { scanMail } from '../../mail-scan.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  const run = (name, fn) => fn().catch((err) => { console.error(`${name} failed:`, err.message); return { failed: true }; });
  const [reports, pencils, mail] = await Promise.all([run('report-due', alertLateReports), run('pencils', async () => ({ lapsed: await expirePencils() })), run('mail scan', () => scanMail())]);
  if (reports.failed) return json(res, 500, { ok: false, error: 'report_due_failed', pencils, mail });
  json(res, 200, { ok: true, ...reports, pencils, mail });
}
