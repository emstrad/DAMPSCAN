/**
 * GET /api/cron/report-due
 *
 * Rings for survey reports past their 24 hours (lib/report-late.js). The
 * hosting plan runs its own schedules once a day, so this is called hourly
 * by the GitHub workflow report-due.yml; the morning and evening runs call
 * the same check too, in case that is not set up.
 *
 * The same hourly run chases pencilled times with no yes after 48 hours
 * (lib/pencils.js) and scans the inbox for the Scheduling board
 * (lib/mail-scan.js), and nudges enquiries nobody has touched in two hours
 * (lib/enquiry-nudge.js). Each runs on its own, so one failing never stops the others.
 * It also pulls the bank feed, so a transfer shows on the customer's page
 * within the hour, and runs the money checks (lib/money-todos.js).
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { alertLateReports } from '../../report-late.js';
import { expirePencils } from '../../pencils.js';
import { scanMail } from '../../mail-scan.js';
import { nudgeUntouched } from '../../enquiry-nudge.js';
import { cardPartials } from '../../partial-cards.js';
import { morningTexts, flushDue, MORNING_HOUR, MORNING_UNTIL } from '../../texts.js';
import { beat } from '../../heartbeat.js';
import { syncFeeds } from '../../bank/revolut.js';
import { moneyChecks } from '../../money-todos.js';
import { sweepOrders } from '../../revolut-pay.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  const run = (name, fn) => fn().catch((err) => { console.error(`${name} failed:`, err.message); return { failed: true }; });
  /* The inbox scan first, so an email just answered is not nudged as untouched. */
  const mail = await run('mail scan', () => scanMail());
  /* The bank before the money checks and texts, so a transfer just in counts. */
  const bank = await run('bank feed', () => syncFeeds());
  /* Card payments whose notice never came, then the money checks. */
  const cards = await run('card payments', () => sweepOrders());
  const money = await run('money checks', () => moneyChecks());
  const [reports, pencils, nudges, partials] = await Promise.all([run('report-due', alertLateReports), run('pencils', async () => ({ lapsed: await expirePencils() })), run('nudges', () => nudgeUntouched()), run('partials', async () => ({ carded: await cardPartials() }))]);
  /* Any step failing turns the hourly workflow red, so it is seen, after every step has had its turn. */
  /* Customer texts: the morning ones at 7 London time, and anything whose two minutes are up. */
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
  const texts = await run('texts', async () => ({ morning: hour >= MORNING_HOUR && hour < MORNING_UNTIL ? await morningTexts() : 0, sent: await flushDue({ limit: 50 }) }));
  await beat('hourly').catch(() => {});
  const failed = Object.entries({ mail, bank, cards, money, reports, pencils, nudges, partials, texts }).filter(([, v]) => v && v.failed).map(([k]) => k);
  if (failed.length) return json(res, 500, { ok: false, error: 'report_due_failed', failed, reports, pencils, mail, nudges, partials });
  json(res, 200, { ok: true, ...reports, pencils, mail, bank, cards, money, nudges, partials, texts });
}
